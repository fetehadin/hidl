# hidl

A senior-year journal: time-locked letters, an exam countdown, and a daily photo calendar. Every account's data is
fully isolated (enforced by Postgres row-level security, not just app code), so the same deployment works either
way:

- **Private**, for one person or a short allowlist of trusted emails (`ALLOWED_EMAIL=a@x.com,b@y.com`) — the
  original intent, and still the default posture if you set it that way.
- **Open to anyone** (`ALLOWED_EMAIL=*`) — each person who signs up gets their own private letters, countdown, and
  calendar; nobody can see anyone else's.

Features:

- **Time-locked letters.** Write to your future self. A letter stays sealed until its opening date, and the database itself refuses to return the body before then.
- **Entrance-exam countdown.** A live countdown to the exam with your target score. Afterwards it shows "Done!" and you can compare your actual score. Optionally, generate a token to feed the countdown into an Android home-screen widget (via a third-party widget app).
- **Image calendar.** Any number of photos per day — pick several at once or drag and drop them — resized on your phone, kept in private storage, with a lightbox and a year-at-a-glance view.
- **Account deletion.** Anyone can permanently delete their own account and everything in it from `/account` — no owner intervention needed.

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Auth, Postgres, Storage) · Vercel

**Hosting is free.** There is no VPS or server to run. The app runs on the Vercel Hobby plan, the database, auth and
photo storage run on the Supabase free plan, and the optional unlock emails use Resend's free plan.

---

## How the important rules are enforced

| Rule | Where it's enforced |
| --- | --- |
| A sealed letter's body is never returned before `unlock_at` | Postgres column privileges: `authenticated` has no `SELECT` on `letters.body`. The only read path is `open_letter(id)` (`SECURITY DEFINER`), which checks ownership and `now() >= unlock_at` using the **database** clock. See `supabase/migrations/*_letters.sql`. |
| Sealed letters can't be edited; the date only moves later | `letters_before_update` trigger plus column grants (only `unlock_at` is updatable) |
| `opened_at` is recorded on first open and can't be faked | Set inside `open_letter`; the client has no `UPDATE` grant on it |
| Any number of photos per day, each owned by one user | No per-day limit — `photos.user_id`/`date` are just columns, RLS and the folder-path check constraint still scope every row to its owner |
| No photos for future days | `photos_before_write` trigger, using `app_today()` (Africa/Addis_Ababa) |
| Users only see their own data | RLS on every table and on the `photos` storage bucket (per-user folder) |
| The widget feed's token can't be read back, even by its owner | `exam_settings.widget_token_hash` has no `SELECT` grant to anyone — only `=` comparison from the service-role API route. Same column-restriction pattern as `letters.body`. |
| Only allowed emails can sign in (unless opened to everyone) | `ALLOWED_EMAIL` is checked in the login action, the magic-link callback and `requireUser()` on every server entry point. Set it to `*` to allow anyone to sign up — each person gets their own isolated letters/countdown/calendar, scoped by RLS. |
| Deleting your account removes everything, not just the login | `deleteAccount()` (`src/actions/auth.ts`) removes the user's storage files first, then deletes the `auth.users` row, which cascades to `letters`, `photos`, and `exam_settings` via `on delete cascade`. Covered by `tests/integration/account-deletion.test.ts`. |

All timestamps are `timestamptz` (UTC). Calendar days are `date` values meaning the local day in Africa/Addis_Ababa. Everything is displayed in Addis time.

---

## Local setup

Requirements: Node 22+, pnpm (run `corepack enable` once to get the pinned version), Docker.
Each developer runs their **own** local Supabase in Docker, so nobody needs the production keys to work on the app.

```bash
pnpm install
pnpm db:start          # Postgres, Auth, Storage, Studio and Mailpit in Docker; applies migrations
pnpm db:status         # prints local URLs and keys
cp .env.example .env.local
```

Fill `.env.local` from the `db:status` output:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` (`http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `PUBLISHABLE_KEY` |
| `SUPABASE_SECRET_KEY` | `SECRET_KEY` (used by tests and the email cron, server-side only) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |
| `ALLOWED_EMAIL` | the email you'll sign in with (comma-separate several, e.g. `a@x.com,b@y.com`, or `*` to let anyone sign up) |

```bash
pnpm dev
```

Open http://localhost:3000 and enter your email. Local Supabase doesn't send real email, so open the magic link from **Mailpit** at http://127.0.0.1:54324. Studio (a database UI) is at http://127.0.0.1:54323.

### Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm test` | Unit tests (time zones, calendar math, validation) |
| `pnpm test:integration` | Tests against the local Supabase: letter lock, one-photo-per-day, storage isolation, exam rules, unlock emails. Needs `pnpm db:start`. Refuses to run against a non-local URL. |
| `pnpm test:all` | Both |
| `pnpm typecheck` / `pnpm lint` | Static checks |
| `pnpm db:reset` | Recreate the local database from `supabase/migrations` |

---

## Supabase (production) setup

1. Create a project at [supabase.com](https://supabase.com) and pick a region close to you (e.g. `eu-central-1`).
2. Link it and push the schema:
   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <your-project-ref>
   pnpm exec supabase db push        # applies supabase/migrations (tables, RLS, bucket, policies)
   ```
3. **Authentication → URL Configuration**:
   - Site URL: `https://<your-app>.vercel.app`
   - Redirect URLs: `https://<your-app>.vercel.app/**`
4. **Email template (cross-device links).** `/auth/confirm` accepts both link formats, but the custom template is
   what makes magic links work from any device, not just the one that requested them:
   - With Supabase's **default** template, the link is a PKCE `?code=` link that only works in the browser that
     requested it (the login page explains this if it happens).
   - With the **custom** template (`supabase/templates/magic_link.html`, pasted into Authentication →
     Email Templates → **Magic Link** and **Confirm signup**), the link works from any device. On the free tier,
     Supabase only allows custom templates once you configure custom SMTP (Authentication → SMTP; Resend's free
     SMTP, or Gmail's SMTP with an [app password](https://myaccount.google.com/apppasswords), both work).
5. **Authentication → Sign In / Providers**: if `ALLOWED_EMAIL` is a specific list (not `*`), sign in once to
   create your account, then turn off **Allow new users to sign up** — the app's allowlist already blocks other
   emails, but this closes it at the source too. Leave sign-ups on if `ALLOWED_EMAIL=*`.
6. **Project Settings → API Keys**: copy the **publishable** key and the **secret** key for Vercel.

> Supabase's built-in email sender is rate-limited (a few emails per hour) and only delivers to members of your
> Supabase organisation, which is fine for a single owner. Set up custom SMTP if you need more.

## Deploy to Vercel

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new), or run `pnpm dlx vercel` from this folder.
2. Add the environment variables (Project → Settings → Environment Variables):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key |
   | `SUPABASE_SECRET_KEY` | secret key (only needed for unlock emails) |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-app>.vercel.app` |
   | `ALLOWED_EMAIL` | your email (comma-separated if more than one person signs in) |

3. Deploy, then make sure the Supabase Site URL and redirect URLs (steps 3–4 above) match the deployed domain.

**Auto-deploy on push.** `.github/workflows/deploy.yml` deploys to Vercel via the CLI after CI passes on `main`,
instead of Vercel's native Git integration (that integration needs its GitHub App installed on the repo owner's
account, which needs admin access we don't have here). It needs a `VERCEL_TOKEN` repository secret (Settings →
Secrets and variables → Actions on GitHub) — generate one at
[vercel.com/account/tokens](https://vercel.com/account/tokens).

### Optional: email on unlock day

`vercel.json` schedules `/api/cron/unlock-emails` daily at 05:00 UTC (08:00 in Addis). It does nothing unless enabled:

| Variable | Value |
| --- | --- |
| `ENABLE_UNLOCK_EMAILS` | `true` |
| `CRON_SECRET` | 32+ random characters (Vercel sends it as a Bearer token) |
| `RESEND_API_KEY` | from [resend.com](https://resend.com) |
| `EMAIL_FROM` | a sender on a domain verified in Resend, e.g. `hidl <letters@yourdomain.com>` |
| `SUPABASE_SECRET_KEY` | required for this job |

The email contains the letter's title and a link, never the body. Each letter is announced once, and failed sends are retried the next day.

---

> **Free-tier limits to know about.** Supabase pauses a free project after a week with no activity; open the
> dashboard and click **Restore** if that happens (data is kept). Vercel Hobby runs cron jobs at most once a day,
> which is all the unlock-email job needs. Resend's free plan allows 3,000 emails a month.

---

## Working together

- Branch from `main` and open a pull request; don't push straight to `main`. GitHub Actions runs typecheck, lint and
  unit tests on every PR (`.github/workflows/ci.yml`).
- Before pushing, run `pnpm typecheck && pnpm lint && pnpm test:all` (integration tests need `pnpm db:start`).
- Database changes go in a **new** file in `supabase/migrations/` (`pnpm exec supabase migration new <name>`).
  Never edit a migration that has already been pushed to production. Apply it locally with `pnpm db:reset`.
- Never commit `.env.local` or real keys. If you add a variable, add a placeholder for it to `.env.example` and a row to this README.
- Production keys live only in Vercel and the Supabase dashboard. Ask the owner for access there instead of sharing keys in chat.

---

## Project layout

```
supabase/migrations/      SQL schema: letters (lock), exam_settings, photos + storage bucket
supabase/templates/       Magic-link email template
src/proxy.ts              Session refresh and optimistic redirect to /login
src/lib/supabase/         Server and browser clients; requireUser() re-checks auth and the allowlist;
                          admin.ts is the service-role client used only for account deletion
src/lib/data/             Typed queries (letters never select `body`)
src/lib/validation/       zod schemas used by every server action and route handler
src/lib/time.ts           Africa/Addis_Ababa helpers
src/lib/image.ts          Client-side resize (1600px) and thumbnail (480px), WebP or JPEG
src/actions/              Server actions, including account deletion (src/actions/auth.ts)
src/app/(auth)/login      Sign-in
src/app/(app)/            Dashboard, /letters, /countdown, /calendar, /account (all require auth)
src/app/api/cron/         Unlock-email job (behind a flag)
tests/unit, tests/integration
```

## Notes

- Photos are resized in the browser and uploaded straight to Supabase Storage through one-time signed upload URLs,
  so large phone photos never go through a Vercel function (which has a 4.5 MB body limit). The server
  checks that the files exist in your folder before recording them, and deletes replaced or orphaned files.
- A day can hold any number of photos. The calendar picker accepts multiple files at once — pick several, or drag
  and drop them onto the upload sheet — and each becomes its own photo. A day's cell shows the first one with a
  `+N` badge; open it to flip through the rest, add more, replace one, or delete one.
- Unsent letter drafts are kept in `localStorage` on the device until the letter is sealed.
- **CAPTCHA (optional).** Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to show a [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile)
  widget on the login form. Its secret key goes directly into Supabase (Authentication → Attack Protection →
  Enable Captcha protection, provider Turnstile) — the app itself never sees it, only the token Turnstile hands
  back, which is passed straight through to `signInWithOtp`. Unset, the form skips the widget entirely.
- **Home-screen widget (Android).** A web app can't place a live widget on a phone's home screen by itself — that
  needs a native app. `/countdown/settings` can generate a token for `GET /api/widget/countdown?token=…`, a
  public (token-authenticated, not session-authenticated) JSON feed of just the exam countdown — never letters or
  photos. Point a widget app like [KWGT](https://play.google.com/store/apps/details?id=org.kustom.widget) at it to
  render it on the home screen. Only the token's SHA-256 hash is stored; the raw token is shown once, at creation.
