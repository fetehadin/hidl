# CLAUDE.md

Shared project context for Claude Code (and humans) working in this repo. Keep it current: when a change adds a
module, changes the architecture, adds a command, or sets a new convention, update this file (and
[`docs/architecture.md`](docs/architecture.md) if the detail lives there) **in the same commit**.

Deeper reading: [`docs/architecture.md`](docs/architecture.md) (how each feature works, file by file) and the
README's "How the important rules are enforced" table (every hard rule and the Postgres object that enforces it).

## 1. Product

**hidl** is a personal journal web app, installable as a PWA (there is no native app):

- **Time-locked letters** to your future self, sealed until an opening date and kept in a post box (`/letters`).
  Encrypted on hidl's server like Telegram's cloud chats (the database holds only ciphertext; the key is
  `LETTER_SECRET_KEY`). Writing asks for nothing; breaking a seal asks for the app lock, if set. Letters from before
  Nov 11, 2026 are end-to-end encrypted and still open with fingerprint / Face ID, the emailed key or a passphrase,
  once; then the browser hands the text to the server to seal, and they open like new ones from then on.
- **Countdowns**: any number, eight kinds (exam with target/actual score, graduation, birthday, wedding, work, trip,
  life, other), shown in the units the user picks, soonest first (no starring), and feed the Android home-screen
  widget (three sizes, Hidi in five moods) through a token-authenticated JSON feed.
- **Photo calendar**: any number of photos or short videos (≤ 5 MB each, 2 GB per person) per day, a pinned "wallpaper" per day, a
  year view, and `/memories`, a pannable board of past photos grouped by day or by the person's own groups
  (named and ordered by them), shared as a Memory Lane picture of a day, a week or a month (or the board as it is), to copy, download or share; the calendar shares its month as it looks.
- Gregorian or Ethiopian date display, a buildable avatar ("buddy") based on the mascot Hidi, account self-deletion,
  a landing page and install guide for signed-out visitors.
- **Feedback** (`/feedback`): anyone signed in can send a bug, idea or praise and see replies to it.
- **Profiles and leaderboard:** a display name on `/account`, shown with the buddy (no uploaded pictures);
  XP from photos, letters and countdowns, spent on streak freezes; `/leaderboard` ranks XP weekly and monthly
  (everyone unless they opt out), with last period's results
  frozen ("released").
- **App lock:** an optional per-device PIN or pattern lock screen (`/account`), plus fingerprint / Face ID (a
  passkey), kept in the browser only. Also asked before a letter's seal is broken (`confirmWithLock`).
- **Account** (`/account`): grouped into Profile, Security, Preferences, Phone app and Help, with quick links. The
  theme is switched from the menu only.
- **Two themes:** Teal Paper (light, default) and Graphite (dark), both in the brand teal, switched per device with
  the half-circle button (side nav, phone header, landing page) or on Account. The phone app's own screens use the
  same palette (`mobile/src/theme.ts`) and follow the page's theme.
- **Admin panel** (`/admin`, admins only): usage numbers (formerly the public `/stats`) with returning people and
  week-1 retention, an Analytics tab (visitors, countries, devices, top pages from PostHog), accounts (search,
  details, suspend, delete, admin access, CSV export), the feedback inbox with replies, an audit log, and a System tab.
- **Product analytics** (optional, PostHog): page views only, identified by account id, no autocapture or recordings
  (`src/components/analytics/analytics.tsx`).

Who it's for: one person or a short allowlist (`ALLOWED_EMAIL=a@x.com,b@y.com`), or anyone (`ALLOWED_EMAIL=*`).
Every account's data is isolated by Postgres RLS either way. It runs on a Contabo VPS (Docker; photo files too, in Garage on
its own 40 GB disk, backed up to Google Drive) with free tiers for the rest
(Supabase free, Resend for all email: sign-in codes through Supabase SMTP, and the unlock emails).

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
| Hosting | Docker on a Contabo VPS behind Caddy (`hidl.fetehadin.com`), Supabase, Resend (sending domain `hidl.fetehadin.com`) | |

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
them (`src/lib/image.ts`) and uploads them straight to the media store with one-time signed URLs (`prepareUpload` →
direct upload → `addPhoto`/`replacePhoto`). The store is Garage on the VPS (`STORAGE_PROVIDER=s3`) or Supabase
Storage (`supabase`); only `src/lib/storage/` knows which. See [`docs/storage.md`](docs/storage.md).

**Key directories**

```
src/proxy.ts                 Next 16 proxy: session refresh + optimistic redirect
src/app/(app)/               Signed-in pages: dashboard, letters, countdown, calendar (+year), memories, account, feedback,
                             leaderboard
src/app/(app)/admin/         Admin panel: overview, analytics, users (+[id], export), feedback, audit, system
src/app/(auth)/login/        Sign-in (magic link, optional Google, optional Turnstile)
src/app/(marketing)/         Public /welcome, /install and /privacy (the only indexable pages); /stats redirects to /admin
src/app/auth/confirm/        Magic-link / OAuth callback
src/app/api/cron/            Daily unlock-email job (Bearer CRON_SECRET, off unless ENABLE_UNLOCK_EMAILS=true)
src/app/api/widget/          Public countdown JSON feed, authenticated by a per-feed token
src/app/download/android/    The Android app's .apk, streamed from /opt/hidl/downloads on the server (not in git)
src/actions/                 Server actions: auth, letters, encryption, countdowns, photos, photo-groups, preferences, feedback, admin,
                             profile
src/lib/supabase/            server.ts (createClient, requireUser, requireAdmin, isAdmin), client.ts, proxy.ts, admin.ts
src/lib/storage/             The media store (Garage/S3 or Supabase Storage): signing, checks, the media_objects record
src/lib/data/                Typed read queries per table
src/lib/validation/          zod schemas used by every action and route handler (server only)
src/lib/                     Pure helpers: time, dates, ethiopian, calendar, calendar-months (Gregorian or Ethiopian
                             months for the photo calendar), names, countdown-kinds/units, e2ee,
                             key-store, letter-crypto (server-only), image, media, memories, photo-groups, share-periods, lane-layout, avatar, env, public-env, feedback, csv,
                             admin-format, user-files, profile-rules, app-lock, media-sniff
src/components/              UI, grouped by feature (letters/, countdown/, calendar/, account/, ...)
public/sw.js                 Service worker: caches photo files, offline page; never caches pages
supabase/migrations/         The schema, in order; supabase/config.toml is the local stack config
supabase/templates/          Branded magic-link and confirm-signup emails (need custom SMTP in prod)
tests/unit/                  Pure logic, no services
tests/integration/           Against a real local Supabase
mobile/                      Expo app (own npm toolchain): Android countdown widget; see mobile/README.md
deploy/media/                Server side of the photo store: disk + Garage setup, backups, alerts, tools (docs/storage.md)
.github/workflows/           ci.yml (web: typecheck, lint, unit tests; mobile: typecheck), deploy-contabo.yml (Docker build + server restart after CI on main)
```

## 4. Data model

All tables are in `public`, each has RLS `user_id = auth.uid()`, and each `user_id` references `auth.users(id)`
**on delete cascade**, which is how account deletion removes everything.

| Table | Key columns | Notes |
| --- | --- | --- |
| `letters` | `title`, `recipient`, `occasion`, `body`, `encrypted`, `unlock_at`, `opened_at`, `unlock_email_sent_at` | No `SELECT` on `body`: read only through `open_letter(id)` once `now() >= unlock_at`. Only `unlock_at` is updatable: earlier or later, only while sealed, only to a future time. `body` is `srv1.…` (sealed on the server, `encrypted = false`), `e2e1/e2e2.…` (`encrypted = true`, older, end-to-end), or plain (oldest); `letters_body_check` checks each shape. |
| `letter_keys` | `user_id` (PK), `public_key`, `private_key_wrapped`, `email_wrapped_key`, `email_share`, `kdf_salt`, `kdf_iterations`, `passphrase_wrapped_key`, `recovery_wrapped_key` | One per user. The key pair (writing needs only `public_key`) and the letter key wrapped once per way in: email key, optional passphrase, old recovery key. At least one way in (check); the pair is set once (`letter_keys_guard`); no `DELETE`. |
| `letter_passkeys` | `credential_id` (PK), `user_id`, `wrapped_key` | Fingerprint / Face ID: the letter key wrapped by a passkey's PRF secret. Own rows only, 10 per person (`53400`). |
| `countdowns` | `kind`, `title`, `target_at`, `target_score`/`max_score`/`actual_score`, `details` jsonb, `units` text[], `is_widget` | `kind` can't be updated; scores only for `exam`; `details` checked by `countdown_details_ok`; one `is_widget` per user. |
| `widget_tokens` | `id`, `user_id`, `countdown_id` (null = the account feed: next one + the list), `token_hash` | `(countdown_id, user_id)` FK → `countdowns(id, user_id)`; `token_hash` is never selectable. |
| `photos` | `date`, `media_type` (image/video), `image_path`, `thumb_path`, `caption`, `is_cover` | Many per day; no future dates (in the owner's zone, from `user_settings`); paths must be in the user's folder; one cover per `(user_id, date)`. |
| `photo_groups`, `photo_group_items` | `name`, `position`; `(group_id, photo_id)` | A person's own photo groups, in their order (`position`, set by `set_photo_group_order`), 50 each, names unique ignoring case (`photo_group_name_ok`). Items join a photo to a group through composite `(id, user_id)` keys, so only the same person's; set per photo by `set_photo_groups`. |
| `media_objects` | `path` (PK), `user_id`, `bytes`, `content_type`, `created_at`, `confirmed_at` | One row per photo/video file. **No user grants**: written by `reserve_media()` (folder, ≤ 5 MB, type, 2 GB per person `53100`, 120 files/hour `53400`) and by the server with the service role (confirm, delete). `media_usage()` tells a person their space. Admin storage numbers come from here. |
| `profiles` | `user_id` (PK), `avatar` jsonb (nullable), `display_name`, `show_on_leaderboard` | Own row only. `avatar_ok()` mirrors `AVATAR_PARTS` in `src/lib/avatar.ts`; `display_name_ok()` mirrors `src/lib/profile-rules.ts`; names unique ignoring case; Write it update-then-insert (no `.upsert()`). Other people's names/buddies come out only through `leaderboard()`. |
| `leaderboard_releases`, `leaderboard_results` | `(period, period_start)`, `rank`, `xp`, `streak`, `photo_days` | No grants. A finished week/month is snapshotted by `leaderboard(p, true)` the first time anyone asks for it. Ranked by XP. |
| `streak_freezes` | `id`, `user_id`, `cost`, `bought_at`, `used_on` (null = still held) | No grants. Bought by `buy_streak_freeze()` (50 XP, hold 2), spent on missed days by `my_streak()`. XP itself isn't stored: `xp_by_day()` computes it. |
| `usage_daily` | `day`, `user_id`, `visits` | No grants at all. Written only by `record_visit()`, read only through `admin_stats()` / `admin_user_detail()` (admins). |
| `feedback` | `kind`, `message`, `page`, `user_agent`, `status`, `reply`, `replied_at` | Users insert (`kind`, `message`, `page`, `user_agent` only) and read their own (not `user_agent`); no update/delete. Status and reply only via `admin_update_feedback`. 10 per person per day (trigger, `53400`). Kinds/statuses mirrored in `src/lib/feedback.ts`. |
| `admins` | `user_id` (PK), `added_by`, `role` (`admin` or `super`) | No grants. `is_admin()` / `my_admin_role()` answer for the caller. Regular admins read and answer feedback; only `super` may suspend, unsuspend or delete accounts (refused in `admin_log`) and change admins (`admin_set_role`; nobody changes their own role, so a super admin always remains). First admins: `SUPER_ADMIN_EMAIL` / `ADMIN_EMAIL` addresses get that role on their next visit (`getAdminRole`, raised never lowered), or insert by hand (README). |
| `admin_audit` | `admin_email`, `action`, `target_user`, `target_email`, `details` | No grants and **no FK cascade**: entries outlive both accounts. Written by `admin_log()`, read by `admin_audit_log()`. |
| `app_handoffs` | `code_hash` (PK), `user_id`, `expires_at`, `used_at` | No grants. SHA-256 of the one-time "sign in on the phone app" code; 10 min, single use, a new code retires the old, 10 an hour. Made by `create_app_handoff()` (as the user), spent by `redeem_app_handoff()` (service role only). |
| `user_settings` | `user_id` (PK), `time_zone` | The device's IANA zone, checked by `time_zone_ok()`. No row = Africa/Addis_Ababa. Written only by `setTimeZone`. |

Files: `<user_id>/<date>-<random>[-thumb].<ext>`, 5 MB each, JPEG/WebP/MP4/WebM/MOV only, in the private `hidl-media`
bucket on Garage (production) or Supabase's private `photos` bucket (`STORAGE_PROVIDER`).
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
scripts/rotate-letter-key.mjs   # re-seal letters under a new LETTER_SECRET_KEY (steps at the top of the file)
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
  and only revalidation clears it. The exceptions are `recordVisit` (`src/actions/usage.ts`): it changes nothing a
  page shows, and revalidating on every app open would throw that cache away; and `createAppCode`
  (`src/actions/app-handoff.ts`), whose code is shown from its return value only.
- **Reads** go through `src/lib/data/*` (throw on error, return typed rows). Letter queries use
  `LETTER_META_COLUMNS`, which never includes `body`.
- **Mirrored rules:** when a Postgres rule has a TypeScript mirror, change both in the same commit:
  `countdown_details_ok` ↔ `src/lib/countdown-kinds.ts`, `countdown_units_ok` ↔ `src/lib/countdown-units.ts`,
  `avatar_ok` ↔ `src/lib/avatar.ts`, `media_objects` checks and `media_quota_bytes()` ↔ `src/lib/media.ts`, `feedback` checks ↔ `src/lib/feedback.ts`,
  `display_name_ok` ↔ `src/lib/profile-rules.ts`, `photo_group_name_ok` and the 50-group limit ↔ `src/lib/photo-groups.ts`, `xp_by_day`/`xp_freeze_cost`/`xp_freeze_max` ↔ `src/lib/xp.ts`,
  leaderboard periods ↔ `periodBounds` in
  `src/lib/data/leaderboard.ts`.
  `timeLeft()` in `src/lib/countdown-units.ts` is also copied to `mobile/src/countdown-units.ts` (the widget counts
  on the phone): change both.
- **Admin features:** every admin read/write is a `SECURITY DEFINER` `admin_*` function that starts with
  `perform public.assert_admin()` (plus `assert_super_admin()` for anything that changes accounts or admins); pages
  call `requireAdmin()` (a 404 for non-admins; it returns the caller's `role`). Anything that needs the
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
- **The name:** "Hidl" (capital H) in text people read: titles, sentences, emails, the app and widget labels. The
  lowercase "hidl" is only the wordmark (the `font-brand` logo, the widget frame, the email header, the Memory Lane mark) and
  identifiers that must not change (domain, `app.hidl.mobile`, `hidl://`, storage keys, file and bucket names).
- **Style:** two themes, Teal Paper (light, default, `:root`) and Graphite (dark, `:root[data-theme="graphite"]`)
  in `src/app/globals.css`; follow the color rules in `docs/architecture.md` (Visual language). Use the tokens
  (`bg-white` = the card surface, `bg-mint`, `text-heading`, `var(--teal)`, `rgb(var(--shadow)/…)`, `--hidi-*` for
  the mascot), never raw hex, or a color won't follow the theme. `text-white` is the card color too, so it is
  wrong for text: use `text-snow` on photos, `text-accent-ink` on `bg-teal`, `text-wax-ink` on `bg-wax`. Fonts:
  `font-title` (Newsreader) for page titles, `font-display`/body (Plus Jakarta Sans), `font-brand` (Fredoka) only
  for the "hidl" wordmark. Check new UI in both themes. The phone app's palette (`mobile/src/theme.ts`) copies
  the tokens: change both.
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
  public paths (`PUBLIC_PATHS` incl. `/privacy`, `/download`, `/api/cron`, `/api/widget`, `/api/health`, `/api/app`) are skipped in `updateSession`. Anything new and public
  that isn't added gets a 307 to `/login`. This has happened twice.
- **Don't use `.upsert()` on column-restricted tables** (`widget_tokens`, `letters`). `ON CONFLICT` needs table-wide
  `SELECT`. Update first, then insert.
- **Swap flags in one function call.** The one-per-user indexes (`is_widget`, `is_cover`) are flipped atomically by
  `set_widget_countdown` / `set_cover_photo`. Don't do two separate updates.
- **App lock is client-only.** `<AppLockGate>` wraps everything in the `(app)` layout; the `hidl-lock` cookie (user
  ids, no secret) makes the server render the page hidden so nothing flashes. Anything new that shows journal content
  outside the `(app)` layout isn't covered by it.
- **Letter bodies:** new letters are sealed on the server (`sealLetterBody` in `src/lib/letter-crypto.ts`, bound
  to the owner's id) and opened by `openLetter(supabase, id, userId)`. **`LETTER_SECRET_KEY` must never be
  lost**: every sealed letter depends on it, so keep a copy outside the server (never paste it into a chat or a
  ticket). To change it, follow `scripts/rotate-letter-key.mjs` (previous key in `LETTER_SECRET_KEY_PREVIOUS`, re-seal,
  then drop it); a body only ever changes through `reseal_opened_letter` or `rotate_letter_body`. Older end-to-end letters
  (`encrypted = true`) still sit inside `<LetterKeyGate need="read">` and move to the server-sealed kind the first
  time they're read after opening (`resealOpenedLetter`). Never send or store the email half of their
  email key anywhere but the one email (`emailLetterKey`), and never log it. The oldest letters are plain text.
- **`ALLOWED_EMAIL` is checked in four places:** the login action, `/auth/confirm` and `/auth/google/callback`
  (which also delete a just-created Google account that isn't allowed), and `requireUser()`.
- **Google sign-in has two paths.** With `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set, hidl runs the Google side
  itself (`src/lib/google-oauth.ts`, callbacks `/auth/google/callback` and `/api/app/auth/google/callback`) and signs
  in with `signInWithIdToken`, so Google's screen names hidl, not `supabase.co`. Without them, Supabase's
  `signInWithOAuth`. Both redirect URIs must be on the Google client.
- **Safe areas:** use `var(--safe-top)` / `var(--safe-bottom)`, never `env(safe-area-inset-*)`. Inside the phone app
  (`data-app` on `<html>`, from the user agent) they're zero, because the app pads its web view natively and
  Android's web view reports the insets anyway (the status bar was counted twice).
- **Service worker:** bump the cache names in `public/sw.js` if the cached format changes. Videos are never cached.
- **Stale `.next`:** mixing `pnpm build` and `pnpm dev` can break `next/font/google` in dev (a 500 on first load).
  `rm -rf .next` fixes it.
- **`/calendar` layout:** the month grid fits the viewport using `--chrome`. Anything added above or below it needs
  `--chrome` adjusted.
- **Orphaned uploads:** if a tab closes mid-upload, files (and their `media_objects` records) can be left behind.
  The monthly orphan report (`deploy/media/tools/orphan-report.mjs`) lists them; nothing deletes them automatically.
- **Photo files and their records go together.** Delete through `discardMedia()` (files first, then records), never
  one without the other, or a person's space is counted wrong. Never sign a link without `ownPaths`/`isOwnPath`.
- **CI doesn't run integration tests** (there's no Docker/Supabase in CI). Run `pnpm test:all` locally for any
  database change.
- **The phone app signs in through `/api/app/*`** (`src/lib/app-auth.ts`): email code (`/auth/email`, `/auth/verify`),
  which providers are on (`/auth/providers`, so the app hides "Continue with Google" until the Supabase provider is
  enabled, as the website does), Google (`/auth/google` → `/auth/google/callback` → `hidl://auth?sealed=…` → `/auth/redeem`), a one-time code
  from an open website tab (`/auth/code`, codes made on Account by `createAppCode`; table `app_handoffs`), and the widget feed
  (`/widget`, bearer token). Its web view takes the session once at `/auth/native`. The allowlist is checked here
  as on the website, so keep these in step with `src/actions/auth.ts` and `/auth/confirm`.
- **No iOS-only props on the phone app's WebView.** Android passes them to the native view unconverted;
  `decelerationRate="normal"` (a string where Android expects a number) crashed the app every time the journal
  opened. JS-only fixes reach installed apps with `cd mobile && npm run update` (EAS Update, channel `preview`);
  anything native needs a new APK (`npm run build:apk`).
- **Home-screen widget code (`mobile/src/widget/`)** may only use the widget library's primitives: no React Native
  views and no fragments (`<>…</>`), or the widget fails to draw on every phone.
- **The widget feed is a public contract.** `mobile/` reads the JSON from `/api/widget/countdown` (type
  `CountdownFeed` in `mobile/src/feed.ts`). Add fields freely, but renaming or removing one breaks widgets already on
  people's phones.
- **Restarting on the server:** the deploy starts `ghcr.io/fetehadin/hidl:<sha>` and then tags it `latest` there, so a
  plain `docker compose up -d` in `/opt/hidl` (needed after editing `.env`) runs the deployed version. Before that
  tag existed, it silently brought back an old image.
- `next dev` may rewrite `AGENTS.md`. Commit that block as it is instead of fighting it.

## 8. Open questions

- **Orphaned uploads:** the report exists; should old orphans be deleted automatically after a review period?
- **Integration tests in CI:** should CI start Supabase (for example with `supabase start` in a Docker-capable job)?
- **Test-only env:** `.env.test.local` (loaded before `.env.local` by `tests/integration/setup.ts`) holds the local
  Garage settings for `tests/integration/media-store.test.ts` (docs/storage.md → Testing locally).
