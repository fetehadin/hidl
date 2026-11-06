# CLAUDE.md

Shared project context for Claude Code (and humans) working in this repo. Keep it current: when a change adds a
module, changes the architecture, adds a command, or sets a new convention, update this file (and
[`docs/architecture.md`](docs/architecture.md) if the detail lives there) **in the same commit**.

Deeper reading: [`docs/architecture.md`](docs/architecture.md) (how each feature works, file by file) and the
README's "How the important rules are enforced" table (every hard rule and the Postgres object that enforces it).

## 1. Product

**hidl** is a personal journal web app, installable as a PWA (there is no native app):

- **Time-locked letters** to your future self, sealed until an opening date, end-to-end encrypted in the browser.
- **Countdowns**: any number, eight kinds (exam with target/actual score, graduation, birthday, wedding, work, trip,
  life, other), shown in the units the user picks; one can be starred, and any can feed an Android home-screen
  widget through a token-authenticated JSON feed.
- **Photo calendar**: any number of photos or short videos (≤ 5 MB) per day, a pinned "wallpaper" per day, a
  year view, and `/memories`, a pannable board of past days.
- Gregorian or Ethiopian date display, a buildable avatar ("buddy") based on the mascot Hidi, account self-deletion,
  a landing page and install guide for signed-out visitors.
- **Feedback** (`/feedback`): anyone signed in can send a bug, idea or praise and see replies to it.
- **Profiles and leaderboard:** a display name and picture (an uploaded photo or the buddy) on `/account`;
  `/leaderboard` ranks photo streaks weekly and monthly (everyone unless they opt out), with last period's results
  frozen ("released").
- **App lock:** an optional per-device PIN or pattern lock screen (`/account`), kept in the browser only.
- **Two themes:** the original bright teal and a bright modern blue, switched per device with the half-circle
  button (side nav, phone header, landing page) or on Account. Hidi and the default buddy change color with it.
- **Admin panel** (`/admin`, admins only): usage numbers (formerly the public `/stats`), accounts (search, details,
  suspend, delete, admin access, CSV export), the feedback inbox with replies, an audit log, and a System tab.

Who it's for: one person or a short allowlist (`ALLOWED_EMAIL=a@x.com,b@y.com`), or anyone (`ALLOWED_EMAIL=*`).
Every account's data is isolated by Postgres RLS either way. It runs on a Contabo VPS (Docker) with free tiers for the rest
(Supabase free, Gmail SMTP for sign-in emails, optional Resend).

## 2. Tech stack

| Area | What | Version (package.json) |
| --- | --- | --- |
| Framework | Next.js App Router, Turbopack, React | `next` 16.4.2, `react` 19.3.0 |
| Language | TypeScript (strict), path alias `@/*` → `src/*` | `typescript` ^5 |
| Styling | Tailwind CSS 4 (`@tailwindcss/turbopack`), tokens in `src/app/globals.css` | `tailwindcss` ^4 |
| Backend | Supabase: Auth (magic link, optional Google), Postgres 17, Storage | `@supabase/ssr` ^0.12.7, `@supabase/supabase-js` ^2.118 |
| Validation | zod (server only) | `zod` ^4.6.7 |
| Dates | date-fns + `@date-fns/tz`; hand-rolled Ethiopian calendar | `date-fns` ^4.4 |
| Tests | Vitest, two projects: `unit` and `integration` | `vitest` ^5.0.5 |
| Lint | ESLint 9 flat config, `eslint-config-next` core-web-vitals + typescript | |
| Tooling | pnpm (pinned via `packageManager`), Node 22 in CI, Supabase CLI (dev dep) | `pnpm` 10.34.6 |
| Hosting | Docker on a Contabo VPS behind Caddy (`hidl.fetehadin.com`), Supabase, Gmail SMTP, Resend for optional emails | |

## 3. Architecture

**Next.js 16 is not the Next.js in most training data.** Middleware is called "proxy" (`src/proxy.ts` exports
`proxy()`). Before writing Next-specific code, read the relevant guide in `node_modules/next/dist/docs/` (see
`AGENTS.md`). Cache Components/PPR are off on purpose: every page is per-user and rendered at request time.

**Request flow.** `src/proxy.ts` → `updateSession` (`src/lib/supabase/proxy.ts`) refreshes the session cookie,
rewrites `/` to `/welcome` for signed-out desktop visitors, and redirects other signed-out requests to `/login`.
That redirect is only a UX shortcut. **The security boundary is `requireUser()`** (`src/lib/supabase/server.ts`),
which re-checks the session and the `ALLOWED_EMAIL` allowlist. Every server component, server action and route
handler that touches data calls it, then queries Supabase **as the user**, so RLS applies.

**Rules live in Postgres, not app code.** Sealing letters, immutability, no future-dated photos, one starred
countdown, unreadable token hashes, and so on are enforced by column grants, triggers, check constraints, partial
unique indexes and `SECURITY DEFINER` functions. The TypeScript side mirrors those rules for UX but never replaces
them. Details per feature: [`docs/architecture.md`](docs/architecture.md#core-architecture).

**Mutations** happen only in server actions (`src/actions/*.ts`) plus two route handlers: the unlock-email cron
and `/auth/confirm`. The widget feed is read-only. Photo files never pass through the app server: the browser resizes
them (`src/lib/image.ts`) and uploads them straight to Storage with one-time signed URLs (`prepareUpload` →
direct upload → `addPhoto`/`replacePhoto`).

**Key directories**

```
src/proxy.ts                 Next 16 proxy: session refresh + optimistic redirect
src/app/(app)/               Signed-in pages: dashboard, letters, countdown, calendar (+year), memories, account, feedback,
                             leaderboard
src/app/(app)/admin/         Admin panel: overview, users (+[id], export), feedback, audit, system
src/app/(auth)/login/        Sign-in (magic link, optional Google, optional Turnstile)
src/app/(marketing)/         Public /welcome and /install (the only indexable pages); /stats redirects to /admin
src/app/auth/confirm/        Magic-link / OAuth callback
src/app/api/cron/            Daily unlock-email job (Bearer CRON_SECRET, off unless ENABLE_UNLOCK_EMAILS=true)
src/app/api/widget/          Public countdown JSON feed, authenticated by a per-feed token
src/app/download/android/    The Android app's .apk, streamed from /opt/hidl/downloads on the server (not in git)
src/actions/                 Server actions: auth, letters, encryption, countdowns, photos, preferences, feedback, admin,
                             profile
src/lib/supabase/            server.ts (createClient, requireUser, requireAdmin, isAdmin), client.ts, proxy.ts, admin.ts
src/lib/data/                Typed read queries per table
src/lib/validation/          zod schemas used by every action and route handler (server only)
src/lib/                     Pure helpers: time, dates, ethiopian, calendar, countdown-kinds/units, e2ee,
                             key-store, image, media, memories, avatar, env, public-env, feedback, csv,
                             admin-format, user-files, profile-rules, app-lock
src/components/              UI, grouped by feature (letters/, countdown/, calendar/, account/, ...)
public/sw.js                 Service worker: caches photo files, offline page; never caches pages
supabase/migrations/         The schema, in order; supabase/config.toml is the local stack config
supabase/templates/          Branded magic-link and confirm-signup emails (need custom SMTP in prod)
tests/unit/                  Pure logic, no services
tests/integration/           Against a real local Supabase
mobile/                      Expo app (own npm toolchain): Android countdown widget; see mobile/README.md
.github/workflows/           ci.yml (web: typecheck, lint, unit tests; mobile: typecheck), deploy-contabo.yml (Docker build + server restart after CI on main)
```

## 4. Data model

All tables are in `public`, each has RLS `user_id = auth.uid()`, and each `user_id` references `auth.users(id)`
**on delete cascade**, which is how account deletion removes everything.

| Table | Key columns | Notes |
| --- | --- | --- |
| `letters` | `title`, `recipient`, `occasion`, `body`, `encrypted`, `unlock_at`, `opened_at`, `unlock_email_sent_at` | No `SELECT` on `body`: read only through `open_letter(id)` once `now() >= unlock_at`. Only `unlock_at` is updatable: earlier or later, only while sealed, only to a future time. |
| `letter_keys` | `user_id` (PK), `kdf_salt`, `kdf_iterations`, `passphrase_wrapped_key`, `recovery_wrapped_key` | One per user. The letter key wrapped twice; no `DELETE`, the recovery copy can't change. |
| `countdowns` | `kind`, `title`, `target_at`, `target_score`/`max_score`/`actual_score`, `details` jsonb, `units` text[], `is_widget` | `kind` can't be updated; scores only for `exam`; `details` checked by `countdown_details_ok`; one `is_widget` per user. |
| `widget_tokens` | `id`, `user_id`, `countdown_id` (null = follow the starred one), `token_hash` | `(countdown_id, user_id)` FK → `countdowns(id, user_id)`; `token_hash` is never selectable. |
| `photos` | `date`, `media_type` (image/video), `image_path`, `thumb_path`, `caption`, `is_cover` | Many per day; no future dates (in the owner's zone, from `user_settings`); paths must be in the user's folder; one cover per `(user_id, date)`. |
| `profiles` | `user_id` (PK), `avatar` jsonb (nullable), `display_name`, `picture_path`, `show_on_leaderboard` | Own row only. `avatar_ok()` mirrors `AVATAR_PARTS` in `src/lib/avatar.ts`; `display_name_ok()` mirrors `src/lib/profile-rules.ts`; names unique ignoring case; `picture_path` must be `<own id>/<16 hex>.webp\|jpg`. Write it update-then-insert (no `.upsert()`). Other people's names/pictures come out only through `leaderboard()`. |
| `leaderboard_releases`, `leaderboard_results` | `(period, period_start)`, `rank`, `streak`, `photo_days` | No grants. A finished week/month is snapshotted by `leaderboard(p, true)` the first time anyone asks for it. |
| `usage_daily` | `day`, `user_id`, `visits` | No grants at all. Written only by `record_visit()`, read only through `admin_stats()` / `admin_user_detail()` (admins). |
| `feedback` | `kind`, `message`, `page`, `user_agent`, `status`, `reply`, `replied_at` | Users insert (`kind`, `message`, `page`, `user_agent` only) and read their own (not `user_agent`); no update/delete. Status and reply only via `admin_update_feedback`. 10 per person per day (trigger, `53400`). Kinds/statuses mirrored in `src/lib/feedback.ts`. |
| `admins` | `user_id` (PK), `added_by` | No grants. `is_admin()` answers for the caller; changed only by `admin_set_admin` (can't remove yourself). First admin: an address in `ADMIN_EMAIL` is added on its next visit (`isAdmin(supabase, user)`), or insert by hand (README). |
| `admin_audit` | `admin_email`, `action`, `target_user`, `target_email`, `details` | No grants and **no FK cascade**: entries outlive both accounts. Written by `admin_log()`, read by `admin_audit_log()`. |
| `user_settings` | `user_id` (PK), `time_zone` | The device's IANA zone, checked by `time_zone_ok()`. No row = Africa/Addis_Ababa. Written only by `setTimeZone`. |

Storage: one private `photos` bucket, `<user_id>/...` folders, 5 MB per file, JPEG/WebP/MP4/WebM/MOV only. One
**public** `avatars` bucket for profile pictures, `<user_id>/<16 hex>.webp|jpg`, 512 KB, WebP/JPEG only.
User preference `calendar` (Gregorian/Ethiopian) lives in `auth.users.user_metadata`, not a table.
`exam_settings` from the first migrations was migrated into `countdowns` and dropped.

## 5. Commands

```bash
corepack enable                 # once, to get the pinned pnpm
pnpm install
pnpm db:start                   # local Supabase in Docker (needs Docker); applies migrations
pnpm db:status                  # local URLs/keys to copy into .env.local (template: .env.example)
pnpm dev                        # http://localhost:3000; magic links arrive in Mailpit at http://127.0.0.1:54324

pnpm typecheck                  # next typegen && tsc --noEmit
pnpm lint                       # eslint
pnpm test                       # unit tests only (what CI runs)
pnpm test:integration           # needs db:start; refuses non-local Supabase URLs; runs files serially
pnpm test:all                   # both
pnpm vitest run tests/unit/time.test.ts   # one file

pnpm build && pnpm start        # production build locally

pnpm exec supabase migration new <name>   # new migration (always a NEW file)
pnpm db:reset                   # rebuild the local DB from supabase/migrations
pnpm db:stop

scripts/move-supabase/move.sh <settings file> [--dry-run]   # copy all data + files to another Supabase project
```

Before pushing: `pnpm typecheck && pnpm lint && pnpm test:all`.

Mobile app (`mobile/`, npm, not pnpm): `cd mobile && npm install && npm run typecheck && npm run doctor`. Build an
installable APK in the cloud with `npm run build:apk` (EAS). The root `tsconfig.json` and ESLint config exclude
`mobile/`; CI type-checks it in its own job (`mobile` in `ci.yml`).

Deploy: pushing to `main` runs CI. Then `deploy-contabo.yml` builds the Docker image (`Dockerfile`, Next `output: "standalone"`) and restarts it
on the Contabo VPS. The Contabo workflow is off until the `CONTABO_HOST` variable is set; see `deploy/README.md`. Production schema changes go out with `pnpm exec supabase db push` against the linked project.
Production env vars are listed in the README.
Production Supabase auth settings (URLs, code length, templates, Google, SMTP) live in
`deploy/supabase-prod/config.toml` and are applied with `deploy/supabase-prod/push.sh` (shows a diff, asks first).

## 6. Conventions

- **Server actions** (`"use server"`): parse input with the zod schema from `src/lib/validation/` first, then call
  `requireUser()`, query with the returned `supabase` (never the admin client unless there's no other way), and
  call `revalidatePath` for every page the change affects. Form actions take `(prevState, formData)` and return a
  `FormState` (`{ status, message?, fieldErrors?, values? }`); other actions return `{ ok: true } | { ok: false,
  message }`. Log failures with `console.error("<actionName>", error)` and show the user a short, friendly message.
- **Every mutating action must call `revalidatePath`.** `experimental.staleTimes` keeps pages in the client cache,
  and only revalidation clears it. The one exception is `recordVisit` (`src/actions/usage.ts`): it changes nothing a
  page shows, and revalidating on every app open would throw that cache away.
- **Reads** go through `src/lib/data/*` (throw on error, return typed rows). Letter queries use
  `LETTER_META_COLUMNS`, which never includes `body`.
- **Mirrored rules:** when a Postgres rule has a TypeScript mirror, change both in the same commit:
  `countdown_details_ok` ↔ `src/lib/countdown-kinds.ts`, `countdown_units_ok` ↔ `src/lib/countdown-units.ts`,
  `avatar_ok` ↔ `src/lib/avatar.ts`, bucket limits ↔ `src/lib/media.ts`, `feedback` checks ↔ `src/lib/feedback.ts`,
  `display_name_ok` and the `avatars` bucket ↔ `src/lib/profile-rules.ts`, leaderboard periods ↔ `periodBounds` in
  `src/lib/data/leaderboard.ts`.
  `timeLeft()` in `src/lib/countdown-units.ts` is also copied to `mobile/src/countdown-units.ts` (the widget counts
  on the phone): change both.
- **Admin features:** every admin read/write is a `SECURITY DEFINER` `admin_*` function that starts with
  `perform public.assert_admin()`; pages call `requireAdmin()` (a 404 for non-admins). Anything that needs the
  service-role client (suspend, delete) calls `admin_log` *first*, so the database refuses non-admins before the
  admin client is touched. Admins see counts, never letter bodies, photos or captions: keep it that way.
- **Client components must not import zod** or anything that does (`src/lib/validation/*`, `src/lib/env.ts`). Use
  `src/lib/public-env.ts` in the browser.
- **Time is per user.** Store `timestamptz` (UTC); a calendar day (`photos.date`) is a `date` in the user's own
  zone. Every helper in `src/lib/time.ts` takes the zone explicitly (`todayISO(tz)`, `formatInTz(d, p, tz)`,
  `localToUtc(local, tz)`, …), so a missed call site is a type error. Get the zone from `requireUser().timeZone` on
  the server and `useTimeZone()` on the client; never use `DEFAULT_TZ` for a signed-in user. Show dates through the
  calendar preference too (`requireUser().calendar`, `useCalendarPref`/`useFormatDay`). A "YYYY-MM-DD" day string
  needs no zone: use `src/lib/calendar.ts` or `formatEthiopianDay`, never `formatInTz`. Details:
  [docs/architecture.md](docs/architecture.md#time-zones).
- **Migrations:** never edit one that has been pushed; add a new timestamped file. New tables get RLS, explicit
  column grants (`revoke all` then grant per column), `on delete cascade` to `auth.users`, and
  `set search_path = ''` on functions. Functions aren't executable by `anon` by default; grant execute explicitly.
- **Lazy-load the heavy calendar pieces** through `src/components/calendar/lazy.tsx`, not by direct import.
- **Style:** two light-only themes, teal (default, `:root`) and blue (`:root[data-theme="blue"]`) in
  `src/app/globals.css`; follow the color rules in `docs/architecture.md` (Visual language). Use the tokens
  (`bg-mint`, `text-heading`, `var(--teal)`, `rgb(var(--shadow)/…)`, `--hidi-*` for the mascot), never raw hex,
  or a color won't follow the theme. Check new UI in both themes.
  kebab-case file names, named exports, comments that explain *why*.
- **Tests:** pure logic gets a unit test in `tests/unit/`; database rules get an integration test in
  `tests/integration/`.
- **Branches and PRs:** never commit to `main` directly. Work on a branch (`feat/…`, `fix/…`, `docs/…`), push, and
  open a PR. If CI passes and there are no conflicts, merge it (merging to `main` deploys to production).
- **Commits:** a short, sentence-case summary of the user-visible change, no type prefix, no trailing period
  (e.g. "Faster tab switching and photo uploads on phones"). One feature per commit. No AI attribution lines.
- **Env:** never commit `.env*` (only `.env.example`). A new variable gets a placeholder in `.env.example` and a row
  in the README.

## 7. Gotchas

- **Public routes are allowlisted by name in two places.** Static files are skipped in the `src/proxy.ts` matcher;
  public paths (`PUBLIC_PATHS` incl. `/download`, `/api/cron`, `/api/widget`, `/api/health`, `/api/app`) are skipped in `updateSession`. Anything new and public
  that isn't added gets a 307 to `/login`. This has happened twice.
- **Don't use `.upsert()` on column-restricted tables** (`widget_tokens`, `letters`). `ON CONFLICT` needs table-wide
  `SELECT`. Update first, then insert.
- **Swap flags in one function call.** The one-per-user indexes (`is_widget`, `is_cover`) are flipped atomically by
  `set_widget_countdown` / `set_cover_photo`. Don't do two separate updates.
- **App lock is client-only.** `<AppLockGate>` wraps everything in the `(app)` layout; the `hidl-lock` cookie (user
  ids, no secret) makes the server render the page hidden so nothing flashes. Anything new that shows journal content
  outside the `(app)` layout isn't covered by it.
- **Encrypted letters:** anything that reads or writes a letter body must sit inside `<LetterKeyGate>`. Older letters
  (`encrypted = false`) are plain text and stay that way.
- **`ALLOWED_EMAIL` is checked in three places:** the login action, `/auth/confirm` (which also deletes a
  just-created Google account that isn't allowed), and `requireUser()`.
- **Service worker:** bump the cache names in `public/sw.js` if the cached format changes. Videos are never cached.
- **Stale `.next`:** mixing `pnpm build` and `pnpm dev` can break `next/font/google` in dev (a 500 on first load).
  `rm -rf .next` fixes it.
- **`/calendar` layout:** the month grid fits the viewport using `--chrome`. Anything added above or below it needs
  `--chrome` adjusted.
- **Orphaned uploads:** if a tab closes mid-upload, files can be left in Storage. Nothing cleans those up yet.
- **CI doesn't run integration tests** (there's no Docker/Supabase in CI). Run `pnpm test:all` locally for any
  database change.
- **The phone app signs in through `/api/app/*`** (`src/lib/app-auth.ts`): email code (`/auth/email`, `/auth/verify`),
  which providers are on (`/auth/providers`, so the app hides "Continue with Google" until the Supabase provider is
  enabled, as the website does), Google (`/auth/google` → `/auth/google/callback` → `hidl://auth?sealed=…` → `/auth/redeem`), and the widget feed
  (`/widget`, bearer token). Its web view takes the session once at `/auth/native`. The allowlist is checked here
  as on the website, so keep these in step with `src/actions/auth.ts` and `/auth/confirm`.
- **The widget feed is a public contract.** `mobile/` reads the JSON from `/api/widget/countdown` (type
  `CountdownFeed` in `mobile/src/feed.ts`). Add fields freely, but renaming or removing one breaks widgets already on
  people's phones.
- `next dev` may rewrite `AGENTS.md`. Commit that block as it is instead of fighting it.

## 8. Open questions

- **Orphaned uploads:** should there be a cleanup job for files no `photos` row points at?
- **Integration tests in CI:** should CI start Supabase (for example with `supabase start` in a Docker-capable job)?
- **Test-only env:** `tests/integration/setup.ts` loads `.env.test.local` before `.env.local`, but that file isn't
  documented. What is meant to go in it?
