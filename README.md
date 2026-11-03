# hidl

A personal journal: time-locked letters, countdowns to any number of deadlines, and a daily photo calendar. Every account's data is
fully isolated (enforced by Postgres row-level security, not just app code), so the same deployment works either
way:

- **Private**, for one person or a short allowlist of trusted emails (`ALLOWED_EMAIL=a@x.com,b@y.com`) — the
  original intent, and still the default posture if you set it that way.
- **Open to anyone** (`ALLOWED_EMAIL=*`) — each person who signs up gets their own private letters, countdown, and
  calendar; nobody can see anyone else's.

Features:

- **Time-locked letters.** Write to your future self. A letter stays sealed until its opening date, and the database itself refuses to return the body before then.
- **Countdowns.** Any number of them, of eight kinds picked from a dialog: exam (with a target score), graduation, birthday (whose, and the age they turn), wedding, work, trip, life milestone, or anything else. Each kind has its own few details. Each shows the time left in whatever units you pick (years, months, days and/or hours, in any mix), then "Done!"; exams let you compare your actual score afterward. The dashboard cycles through all your upcoming ones. Star one to show it first, and give any countdown its own Android home-screen widget (via a third-party widget app).
- **Image calendar.** Any number of photos per day — pick several at once or drag and drop them — resized on your phone, kept in private storage, with a lightbox and a year-at-a-glance view. Pin one photo as a day's "wallpaper" to choose which picture the calendar shows.
- **Hidi, your shortcut buddy.** The mascot sits in the bottom-right corner of every page. Tap it and it hops, smiles, and fans out shortcuts: add today's photo, write a letter, start a countdown, open memories.
- **Gregorian or Ethiopian dates.** Gregorian by default; switch to the Ethiopian calendar on `/account`.
- **Account deletion.** Anyone can permanently delete their own account and everything in it from `/account` — no owner intervention needed.
- **Installable as an app.** It's a Progressive Web App — "Add to Home Screen" (Android Chrome or iOS Safari) gives
  a real app icon and a full-screen launch with no browser UI, using the exact same sign-in session as the site.

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Auth, Postgres, Storage) · Vercel

**Hosting is free.** There is no VPS or server to run. The app runs on the Vercel Hobby plan, the database, auth and
photo storage run on the Supabase free plan, and the optional unlock emails use Resend's free plan.

---

## How the important rules are enforced

| Rule | Where it's enforced |
| --- | --- |
| A sealed letter's body is never returned before `unlock_at` | Postgres column privileges: `authenticated` has no `SELECT` on `letters.body`. The only read path is `open_letter(id)` (`SECURITY DEFINER`), which checks ownership and `now() >= unlock_at` using the **database** clock. See `supabase/migrations/*_letters.sql`. |
| Letter text is end-to-end encrypted: only the writer can read it, not the server or anyone with the database | The browser encrypts the body (AES-256-GCM, WebCrypto, `src/lib/e2ee.ts`) before sending it, with a per-user letter key stored only wrapped: by a key derived from the user's passphrase (PBKDF2-SHA256, 600k) and by a one-time recovery key. Neither secret is ever sent. `letter_keys` has no `DELETE` and its recovery copy can't be updated; `letters.encrypted` is immutable and `letters_body_check` requires the ciphertext shape. Letters written before this (2026-11-03) stay plain text. The time lock above still applies to the ciphertext. |
| Sealed letters can't be edited; the date only moves later | `letters_before_update` trigger plus column grants (only `unlock_at` is updatable) |
| `opened_at` is recorded on first open and can't be faked | Set inside `open_letter`; the client has no `UPDATE` grant on it |
| Any number of photos per day, each owned by one user | No per-day limit — `photos.user_id`/`date` are just columns, RLS and the folder-path check constraint still scope every row to its owner |
| No photos for future days | `photos_before_write` trigger, using `app_today()` (Africa/Addis_Ababa) |
| Short videos are allowed, up to 5 MB, and a row's file matches its type | The `photos` bucket's `file_size_limit` (5 MB, every file) and `allowed_mime_types` (JPEG, WebP, MP4, WebM, MOV), enforced by Storage on upload; the `photos_media_matches_path` check ties `media_type` to the file extension (video rows → `.mp4/.webm/.mov`, thumbnails always an image) |
| Users only see their own data | RLS on every table and on the `photos` storage bucket (per-user folder) |
| An exam countdown always has scores; no other kind ever does | A check constraint on `countdowns`: `kind = 'exam'` requires `target_score`/`max_score`, every other kind forbids them. `kind` has no `UPDATE` grant, so it can't be changed after creation either. |
| A countdown only stores the details its kind allows | `countdown_details_ok(kind, details)` in a check constraint on the `details` jsonb column: allowed keys per kind, string lengths, `birth_year` a whole number, and a birthday must say whose. The same list lives in `src/lib/countdown-kinds.ts` for the form. |
| At most one countdown feeds the widget | A partial unique index, `countdowns (user_id) where is_widget`. Flipping which one is atomic via the `set_widget_countdown(id)` function, so the index is never violated mid-change. |
| A day has at most one pinned "wallpaper" photo | A partial unique index, `photos (user_id, date) where is_cover`. `set_cover_photo(id, pinned)` clears the day's old pin and sets the new one in one call. |
| A countdown's own widget token can only point at that user's countdown | `widget_tokens (countdown_id, user_id)` is a foreign key to `countdowns (id, user_id)` (`on delete cascade`), and `unique nulls not distinct (user_id, countdown_id)` allows one starred-feed token plus one per countdown. |
| The widget feed's token can't be read back, even by its owner | `widget_tokens.token_hash` has no `SELECT` grant to anyone — only `=` comparison from the service-role API route. Same column-restriction pattern as `letters.body`. |
| Only allowed emails can sign in (unless opened to everyone) | `ALLOWED_EMAIL` is checked in the login action, the magic-link callback and `requireUser()` on every server entry point. Set it to `*` to allow anyone to sign up — each person gets their own isolated letters/countdown/calendar, scoped by RLS. |
| Deleting your account removes everything, not just the login | `deleteAccount()` (`src/actions/auth.ts`) removes the user's storage files first, then deletes the `auth.users` row, which cascades to `letters`, `photos`, and `countdowns` via `on delete cascade`. Covered by `tests/integration/account-deletion.test.ts`. |

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
| `pnpm test:integration` | Tests against the local Supabase: letter lock, multi-photo calendar, storage isolation, countdown rules, widget token, account deletion, unlock emails. Needs `pnpm db:start`. Refuses to run against a non-local URL. |
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
   - With the **custom** templates (branded, light teal, with the Hidi mascot), the link works from any device.
     Paste `supabase/templates/magic_link.html` into Authentication → Email Templates → **Magic Link**
     (subject: `Your hidl sign-in link`) and `supabase/templates/confirm_signup.html` into **Confirm signup**
     (subject: `Welcome to hidl: confirm your email`). Their mascot images load from `{{ .SiteURL }}/email/`, so
     Authentication → URL Configuration → **Site URL** must be your deployed app URL. On the free tier,
     Supabase only allows custom templates once you configure custom SMTP (Authentication → SMTP; Resend's free
     SMTP, or Gmail's SMTP with an [app password](https://myaccount.google.com/apppasswords), both work).
5. **Authentication → Sign In / Providers**: if `ALLOWED_EMAIL` is a specific list (not `*`), sign in once to
   create your account, then turn off **Allow new users to sign up** — the app's allowlist already blocks other
   emails, but this closes it at the source too. Leave sign-ups on if `ALLOWED_EMAIL=*`.
6. **Project Settings → API Keys**: copy the **publishable** key and the **secret** key for Vercel.
7. **"Continue with Google" (optional).** The login page shows the button automatically once Google is enabled
   in Supabase (it checks Auth's public settings; no app config or redeploy needed, appears within a minute).
   1. In [Google Cloud Console](https://console.cloud.google.com/), create a project, then open **Google Auth
      Platform**. Under **Branding**, set the app name (`hidl`), a support email and optionally the logo
      (`public/icon-512.png`). Under **Audience**, choose **External** and press **Publish app**, otherwise only
      listed test users can sign in. The app only asks for name and email (`openid`, `email`, `profile`), which
      needs no Google review.
   2. **Clients → Create client → Web application.** Authorized JavaScript origin: `https://<your-app>.vercel.app`.
      Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback` (Supabase shows the exact one
      on the Google provider page).
   3. Supabase → **Authentication → Sign In / Providers → Google**: enable it and paste the client ID and secret.
   - Google accounts still have to pass `ALLOWED_EMAIL`. A Google account that isn't allowed is signed out, shown
     "This journal is private", and the account that attempt created is deleted again (`/auth/confirm`).
   - If you turned off **Allow new users to sign up** (step 5), Google works for your existing account (Supabase
     links a Google login to the account with the same verified email) but can't create new ones.
   - Google's screen says "continue to `<project-ref>.supabase.co`" unless you add a Supabase custom domain (paid).

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
supabase/migrations/      SQL schema: letters (lock), countdowns, widget_tokens, photos + storage bucket
supabase/templates/       Branded sign-in + confirm-signup email templates
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

- **Gregorian or Ethiopian calendar.** Dates are shown in the Gregorian calendar by default. Choosing Ethiopian on
  `/account` (saved in the user's auth metadata, `user_metadata.calendar`, so it follows them across devices)
  shows every absolute date (letters, countdowns, the dashboard header, the photo viewer, memories) as the
  Ethiopian date, with the Gregorian date kept as a smaller secondary line. This is purely a display-layer
  conversion (`src/lib/ethiopian.ts`, hand-rolled, no dependency; `src/lib/dates.ts` picks the calendar) — storage
  stays UTC `timestamptz`, and nothing about locking/countdown logic changes. Date *inputs* (datetime-local
  pickers) stay native Gregorian, since browsers don't support an Ethiopian-calendar picker, but in Ethiopian mode
  they show a live Ethiopian-equivalent label next to them. The calendar's month grid itself (`/calendar`) stays
  Gregorian-indexed, since its navigation is tied to the `?m=` query param and photo date-range queries.
- Photos are resized in the browser and uploaded straight to Supabase Storage through one-time signed upload URLs,
  so large phone photos never go through a Vercel function (which has a 4.5 MB body limit). The server
  checks that the files exist in your folder before recording them, and deletes replaced or orphaned files.
- A day can hold any number of photos. The calendar picker accepts multiple files at once — pick several, or drag
  and drop them onto the upload sheet — and each becomes its own photo. A day's cell shows its pinned "wallpaper" (or else the first one) with a
  `+N` badge; open it to flip through the rest, pin one as the wallpaper, add more, replace one, or delete one.
- Unsent letter drafts are kept in `localStorage` on the device until the letter is sealed.
- **CAPTCHA (optional).** Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to show a [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile)
  widget on the login form. Its secret key goes directly into Supabase (Authentication → Attack Protection →
  Enable Captcha protection, provider Turnstile) — the app itself never sees it, only the token Turnstile hands
  back, which is passed straight through to `signInWithOtp`. Unset, the form skips the widget entirely.
- **Home-screen widgets (Android).** A web app can't place a live widget on a phone's home screen by itself — that
  needs a native app. A token for `GET /api/widget/countdown?token=…` gives a public (token-authenticated, not
  session-authenticated) JSON feed of exactly one countdown, never letters or photos. Make one per countdown
  with the **Widget** button on its card (so you can have a widget for each), or one on `/countdown/settings`
  that always follows whichever countdown is starred. Point a widget app like
  [KWGT](https://play.google.com/store/apps/details?id=org.kustom.widget) at it to render it on the home screen.
  Only the token's SHA-256 hash is stored; the raw token is shown once, at creation.
- **PWA / "Add to Home Screen."** `src/app/manifest.ts` plus `public/sw.js` (a service worker that never caches
  pages, since every page is per-user and dynamic, but keeps photo files on the device so each is downloaded
  once, cleared on sign-out, and shows a friendly offline page when there's no connection; it also lets Android's
  install prompt treat this as a real app, not a bookmark). Installing doesn't create a separate login: it's the
  same origin, so it shares the site's session cookie. Signing in stays persistent either way — Supabase's own
  session has no inactivity or hard timeout configured, and the auth cookie is set to last 400 days by default —
  so you're only signed out by explicitly signing out, clearing site data, or (on iOS specifically) Safari's
  cross-site data cap after a long stretch of not opening the installed app, which is a platform limitation, not
  something this app controls.
