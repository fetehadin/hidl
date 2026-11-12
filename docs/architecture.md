# hidl architecture (deep dive)

The detailed companion to [`CLAUDE.md`](../CLAUDE.md). The README's "How the important rules are enforced" table is
the one-page summary of the database-enforced rules; this file explains how each piece works and where it lives.

## Core architecture

**This is Next.js 16, not the Next.js in most training data** — middleware is renamed to "proxy": the file is
`src/proxy.ts` (not `middleware.ts`), and it exports `proxy()` instead of `middleware()`. Before writing
Next.js-specific code, check `node_modules/next/dist/docs/` for breaking changes rather than assuming prior Next.js
knowledge. Cache Components/PPR are intentionally left off in `next.config.ts` — every page is per-user and
rendered at request time.

**Auth has two layers, both required:**
- `src/proxy.ts` → `src/lib/supabase/proxy.ts` (`updateSession`): runs on every matched request, refreshes the
  session cookie, and does an *optimistic* redirect to `/login` for unauthenticated users on non-public paths.
  This is a UX optimization only — it is not the security boundary.
- `src/lib/supabase/server.ts` (`requireUser()`): the actual security boundary. Re-checks the session server-side
  and checks `ALLOWED_EMAIL` via `isAllowedEmail()` in `src/lib/env.ts`. Every server component, server action,
  and route handler that touches data must call this. A session that's valid but not on the allowlist gets signed
  out and redirected with `?error=not-allowed`.

**Database-enforced invariants, not app-enforced.** Each feature pushes its hard rule into Postgres so the app
layer physically cannot violate it, even with a bug:
- *Letters* (`supabase/migrations/..._letters.sql`): `authenticated` has no `SELECT` grant on the `body` column at
  all — only `public.open_letter(id)`, a `SECURITY DEFINER` function, can return it, and only after checking
  `now() >= unlock_at` with the **database's** clock. Triggers (`letters_before_update`) make a letter immutable
  except `unlock_at`, which can move earlier or later while the letter is still sealed, but only to a time still in
  the future (`..._letter_date_any_direction.sql`; `changeLetterDate` / `ChangeDateForm`). `src/lib/data/letters.ts` mirrors this: `LETTER_META_COLUMNS`
  never includes `body`; reading it goes through `openLetter()` → the RPC, with `LetterSealedError` thrown on the
  `hint: "sealed"` error code.
- *Letters sealed on the server* (since Nov 11, 2026; `..._letters_server_sealed.sql`, `src/lib/letter-crypto.ts`):
  the way Telegram's cloud chats work. `createLetter` gets the text over TLS and stores
  `srv1.<iv>.<AES-256-GCM ciphertext + tag>` (with `encrypted = false`), using `LETTER_SECRET_KEY`, which lives only
  in the server's environment, and the owner's user id as additional data (a body copied to another account won't
  open). So Supabase, its backups and anyone reading the database see ciphertext; hidl's server can read letters,
  which is what lets them open on any device with nothing to set up. `openLetter()` decrypts after `open_letter`
  has checked the date. Breaking a seal first asks for the device's app lock (`confirmWithLock()` in
  `src/components/lock/confirm-lock.ts`, answered by `<AppLockGate>` with a cancellable lock screen); with no lock
  set it goes straight ahead. The key must never be lost (every sealed letter needs it).
  *Changing the key* (`..._letters_reseal.sql`, `scripts/rotate-letter-key.mjs`): the old key goes in
  `LETTER_SECRET_KEY_PREVIOUS` and `openLetterBody` tries both; the script, run in the app container, re-seals each
  body under the new key through `rotate_letter_body` (service role only, srv1 to srv1, swapped only if unchanged
  since read), and then the previous key is removed. The trigger lets a body change only for the one letter such a
  function names in a transaction-local setting (`hidl.reseal_letter`), which nothing over the API can set.
  *Old letters move over* (`reseal_opened_letter`, `resealOpenedLetter` in `src/actions/letters.ts`): when an
  end-to-end letter has been opened and the owner's browser decrypts it, the text goes to the server, which seals it
  as `srv1` and clears `encrypted`. Owner only, once, and only after `opened_at` is set, so it can't touch a letter
  that's still sealed. When no `encrypted = true` letters are left, the end-to-end code can be removed.
- *End-to-end letters* (before Nov 11, 2026; `..._letter_encryption.sql`, `..._letter_keys_ways_in.sql`,
  `src/lib/e2ee.ts`): letter bodies were end-to-end encrypted in the browser. Each person has a letter key (AES-256-GCM) and an ECDH P-256
  key pair: the public half is stored plain and new letters are encrypted to it (`e2e2.<ephemeral>.<iv>.<ct>`), so
  **writing never asks for anything**; the private half is stored encrypted with the letter key, so reading needs
  the letter key. Older bodies (`e2e1.<iv>.<ct>`) use the letter key directly. `letter_keys` holds the letter key
  only wrapped, once per way in: the **email key** (HKDF of a 32-byte half emailed to the person, never stored,
  and a 32-byte `email_share` stored here; the email at `/letters/key#k=…` keeps the half in the URL fragment,
  which never reaches the server; `src/lib/letter-key-email.ts`, sent by `emailLetterKey`), **passkeys**
  (`letter_passkeys`: wrapped by the WebAuthn PRF secret, fingerprint / Face ID, `src/lib/passkey.ts`), an optional
  **passphrase** (PBKDF2-SHA256, 600k) and, for early accounts, a **recovery key**. Setup asks for nothing: it makes
  the keys, emails the key and offers a passkey. Accounts from before get the key pair and email key on their next
  unlock (`upgradeLetterKeys`; the pair can never be replaced, trigger `letter_keys_guard`). The server never
  sees the raw letter key or text; it sees the email half once, in transit, to send it. Anything that writes or
  reads an encrypted body sits inside `<LetterKeyGate need="write" | "read">` (`src/components/letters/letter-key.tsx`),
  which provides `useLetterWriter()` / `useLetterReader()`. The unlocked key is remembered per device as a
  non-extractable CryptoKey in IndexedDB (`src/lib/key-store.ts`), wiped on `/login` with the photo cache. New letters
  no longer use any of this, and Account no longer manages the ways in; an old letter's page still unlocks with
  any of them (`<LetterKeyGate need="read">`). `open_letter` predates `encrypted`; read the flag
  from the letter's meta. Older letters (`encrypted = false`) stay plain text: they're immutable once sealed.
- *Photos*: a day can hold any number of photos (no per-day limit); `photos_before_write` rejects future dates
  using the database clock in the owner's time zone (`user_settings.time_zone`, else Africa/Addis_Ababa) as the
  server-side source of truth. Actions are keyed by photo `id`,
  not date, since a day's photos aren't unique (`src/actions/photos.ts`: `addPhoto`/`replacePhoto`/`deletePhoto`).
- *Videos* (`..._photo_videos.sql`): a calendar entry can be a short video, stored as a `photos` row with
  `media_type = 'video'`: `image_path` is the video (uploaded as-is, not re-encoded) and `thumb_path` a still
  frame grabbed in the browser, so every thumbnail view works unchanged. The 5 MB cap is the bucket's
  `file_size_limit` (enforced by Storage); `photos_media_matches_path` ties the type to the file extensions.
  `src/lib/media.ts` mirrors the limit/types (no zod, so client code can use it); `PhotoView.isVideo` drives the
  `<video>` in the lightbox and the `VideoBadge` on thumbnails. The service worker never caches videos (players
  use Range requests, which a cached whole-file response can't answer).
- *Countdowns* (`supabase/migrations/..._countdowns.sql`, `..._countdown_kinds.sql`): eight kinds (`exam`,
  `graduation`, `birthday`, `wedding`, `work`, `trip`, `life`, and `deadline`, shown as "Other"). A check
  constraint ties scores to kind (`exam` requires `target_score`/`max_score`, every other kind forbids them), and
  per-kind details live in a `details` jsonb column checked by `countdown_details_ok(kind, details)` (allowed keys,
  types, lengths). Its key list is mirrored in `src/lib/countdown-kinds.ts` (labels, form fields, card text), which
  the zod schema (`parseCountdown`) is built from; change both together. `kind` has no `UPDATE` grant,
  so it can't be changed after creation. A partial unique index, `countdowns (user_id) where is_widget`, allows
  at most one starred countdown per user; `set_widget_countdown(id)` flips it atomically (clear-then-set in one
  function call) so that index is never transiently violated. Starring is no longer offered anywhere (the site and
  the widget put the soonest countdown first); the column, index and function stay so nothing old breaks.
- *Cover photos*: `photos.is_cover` marks a day's pinned "wallpaper"; a partial unique index allows one per
  `(user_id, date)`, and `set_cover_photo(id, pinned)` moves it (clear-then-set, like `set_widget_countdown`).
  The calendar, dashboard and month grid show the pinned photo, falling back to the first one.
- *Widget tokens*: one row per feed. `countdown_id` null is the account feed (the next countdown, plus
  the `countdowns` list the phone widget flips through: soonest first, including ones that ended in the last 7 days,
  each with `createdAt` for the progress bar); otherwise the token
  serves only that countdown (composite FK `(countdown_id, user_id)` → `countdowns (id, user_id)`, so it can't
  point at another user's countdown, and deleting the countdown deletes the token; `unique nulls not distinct
  (user_id, countdown_id)`). `widget_tokens.token_hash` has no `SELECT` grant to anyone, including its owner — same
  column-restriction pattern as `letters.body`. The public feed (`src/app/api/widget/countdown`) looks it up by
  `=` via the service-role client; nothing else can read it back. Generating one must use plain
  update-then-insert, not `.upsert()` — Postgres's `ON CONFLICT DO UPDATE` needs full-table `SELECT` to detect the
  conflict, which a column-restricted table can't satisfy (`src/actions/countdowns.ts` `generateWidgetToken`).
- Every table has RLS scoped to `user_id = auth.uid()`. Photo files sit in per-user folders (`<user id>/...`)
  in whichever store holds them (Supabase's `photos` bucket, with matching storage policies, or the self-hosted
  Garage bucket, where the server checks the folder before signing anything; see [storage.md](storage.md)).

**Account deletion** (`deleteAccount()` in `src/actions/auth.ts`) removes the user's photo files first
(`removeUserFiles` → the media store's `removeFolder`), then deletes the `auth.users` row via `createAdminClient()`
(service-role, `src/lib/supabase/admin.ts`) — which cascades via `on delete cascade` to every user table:
`letters`, `letter_keys`, `photos`, `media_objects`, `countdowns`, `widget_tokens`, and `profiles`. A new user table needs the same
`references auth.users (id) on delete cascade`, or account deletion leaves its rows behind. Covered end-to-end in `tests/integration/account-deletion.test.ts`.

**Photo upload is two-step and never passes through the app server, on purpose.** Images are resized client-side
(`src/lib/image.ts` `processMedia`: 1600px full image + 480px thumbnail, WebP or JPEG; videos ≤ 5 MB go up as-is
with a frame-grab thumbnail) and uploaded directly to the media store (Garage on the VPS, or Supabase Storage;
`STORAGE_PROVIDER`, [storage.md](storage.md)) via one-time signed URLs, never through the app server. All store
access goes through `src/lib/storage/` (`mediaStore()`); nothing else knows which store is in use. The flow
(`src/actions/photos.ts`):
1. `prepareUpload(date, full, thumb)` — sends each file's extension and exact size. `reserve_media()` (Postgres,
   `..._media_objects.sql`) checks the folder, name, size (≤ 5 MB), type, the 2 GB per-person space (`53100`) and
   120 files an hour (`53400`), and records both files in `media_objects`; then the store signs a 5-minute upload
   link per file (with Garage, locked to that exact size and type).
2. (client PUTs both files to those links) — the upload sheet does steps 1–2 **in the
   background as soon as a photo is picked**, so Save usually only runs step 3. Files for a photo that's removed
   from the sheet, or never saved (the sheet closes), are deleted via `discardUpload()`, which only touches the
   user's own files and never ones a `photos` row points at. (A tab closed mid-way can still leave orphans; the
   monthly orphan report lists them.)
3. `addPhoto()` (new photo) or `replacePhoto()` (swap one photo's file by `id`) — checks both paths match the
   user's folder pattern (`uploadPathsOk`), then `verifyUploads()` reads each stored file's size, type and first
   bytes (`src/lib/media-sniff.ts`) against its `media_objects` record and marks it confirmed. Anything that
   doesn't match is deleted with its record. Files and records are always removed together (`discardMedia`), with
   the service role: users have no grants on `media_objects`, so they can't shrink their usage.

Viewing: `signPhotos(supabase, userId, rows)` signs 15-minute links, only for paths in the user's folder.
`<MediaLinkRefresher>` (in the `(app)` layout) re-renders the page every 12 minutes while visible, so links on
a page left open don't expire; the service worker caches photos by path, so that costs nothing. People see how
much of their space they've used only from 90% on (`<PhotoSpaceNotice>`: upload sheet and Account).

<a id="time-zones"></a>**Time zones are per user, like any global app** (`src/lib/time.ts`,
`..._user_time_zones.sql`). Instants are `timestamptz` (UTC); a calendar day is the user's local day. How a user's
zone is known:
1. `TimeZoneSync` (in `src/components/calendar-pref.tsx`, mounted by the `(app)` layout) compares the device's zone
   (`Intl.DateTimeFormat().resolvedOptions().timeZone`) with the one the server rendered with. On the first visit,
   after travelling, or on a new device, they differ, so it calls `setTimeZone` and `router.refresh()`.
2. `setTimeZone` (`src/actions/preferences.ts`) validates the name, saves it in `user_settings` (update-then-insert,
   since the table is column-restricted), and only then sets the `hidl-tz` cookie. The cookie and the row therefore
   can't drift apart.
3. `requireUser()` returns `timeZone` from that cookie (validated, else `DEFAULT_TZ` = Africa/Addis_Ababa, the zone
   all pre-existing data was written in). Server code passes it on, and `CalendarPrefProvider` hands the same value
   to client components through `useTimeZone()`. Server and client therefore render identical dates.
4. Places with no session read the stored row instead. The database's `photos_before_write` judges "no future
   photos" in the owner's zone, and the widget feed computes `daysLeft`/`remaining` in it (and returns `timeZone`).

Every helper takes the zone explicitly, with no hidden default, so a call site that forgets it fails to compile.
Wall-clock inputs (`datetime-local`) are interpreted in the user's zone on both the client preview and the server
action. A "YYYY-MM-DD" day string is already a local day: format it with `src/lib/calendar.ts` /
`formatEthiopianDay`, never through a zone (a western zone would shift it a day back).

**Validation (`src/lib/validation/*.ts`, zod) is the single schema every server action and route handler parses
input through** — there's no separate client-side-only validation path to keep in sync.

**Layout:**
```
supabase/migrations/   SQL schema: letters (lock), letter_keys, countdowns, widget_tokens, photos + storage
                       bucket, profiles
supabase/templates/    Magic-link and confirm-signup email templates (only needed if using custom SMTP)
src/proxy.ts           Optimistic auth redirect (Next 16 "proxy", not middleware)
src/lib/supabase/      Server/browser Supabase clients; requireUser() is the real auth check;
                       admin.ts is the service-role client, used only for account deletion, the widget feed,
                       and deleting a just-created non-allowlisted OAuth account in /auth/confirm (the cron
                       route builds its own service-role client)
src/lib/data/          Typed queries (letters never select `body`)
src/lib/validation/    zod schemas shared by actions and route handlers
src/lib/time.ts        Per-user time zone helpers (zone always passed in); all timestamps go through this
src/lib/image.ts       Client-side resize/thumbnail before upload
src/actions/           Server actions (the only place that mutates data, alongside the cron and widget routes)
src/app/(auth)/login   Sign-in
src/app/(app)/         Dashboard, /letters, /countdown (+ /new, /[id]/edit, /settings for the widget token),
                       /calendar, /memories, /account — all require auth
src/app/api/cron/      Unlock-email job, behind ENABLE_UNLOCK_EMAILS
src/app/api/widget/    Public, token-authenticated countdown feed for a phone's home-screen widget app
tests/unit/            Pure logic (time zones, calendar math, memories layout) — no external services
tests/integration/     Real local Supabase: letter lock, multi-photo calendar, storage isolation, countdown
                       rules, widget token, account deletion, unlock emails
```


## Feature notes

- **Dates are Gregorian by default**; Ethiopian is a per-user option on `/account`, stored in
  `user_metadata.calendar` and read from the JWT claims by `requireUser()` (returned as `calendar`;
  `setCalendarPref` refreshes the session so the new claim applies at once). Server components get it from
  `requireUser()`; client components use `useCalendarPref()` / `useFormatDay()` from
  `src/components/calendar-pref.tsx` (the provider is in the `(app)` layout). Don't call `formatEthiopian`
  unconditionally for display; check the preference.
- **Landing page and install help:** signed-out visitors on a computer get the landing page at `/`:
  `updateSession` (`src/lib/supabase/proxy.ts`) *rewrites* `/` to `/welcome` (the address stays `/`) unless
  `userAgent().device.type` is `mobile`; phones go straight to `/login` as before. `/welcome` and `/install` (the
  "get the app" steps per device, plus a one-tap install button where `beforeinstallprompt` fires) live in
  `src/app/(marketing)/` and are in `PUBLIC_PATHS`. These two are the only indexable pages (`robots` in their
  metadata; the root layout stays `noindex`). The QR codes are rendered server-side by `qrcode`
  (`src/components/marketing/qr-code.tsx`), so the library never ships to the browser. There is no native app:
  "the app" is the installable PWA.
- **Usage stats:** shown on the admin overview (`src/app/(app)/admin/page.tsx`) from `admin_stats()`
  (`..._admin_and_feedback.sql`, which dropped the old public `public_stats()`; `/stats` now redirects to `/admin`
  in `next.config.ts`). Visits are counted by `<UsagePing>` in the `(app)` layout: once per browser tab per day, on
  idle, via `recordVisit` → `record_visit()`. `usage_daily` has no grants; don't add any.
- **Admin panel** (`src/app/(app)/admin/`, migration `..._admin_and_feedback.sql`):
  - *Who:* `public.admins` (no grants). `is_admin()` is the only way to ask; the `(app)` layout uses it to show the
    side nav's Admin link, `/account` shows an Admin card (the phone way in). `requireAdmin()` in
    `src/lib/supabase/server.ts` 404s everyone else. The first admin comes from the `ADMIN_EMAIL` list (`isAdmin(supabase,
    user)` adds a listed, signed-in address to `admins` with the service-role client; the database stays the source of
    truth) or from SQL (README → Admin panel); after that, from a user's page (`admin_set_role`, which refuses changing
    your own role, so a super admin always remains).
  - *Levels:* `admins.role` is `admin` or `super` (`my_admin_role()`, `getAdminRole()`). `SUPER_ADMIN_EMAIL` addresses
    become `super`. Only `super` may suspend, unsuspend or delete accounts (`admin_log` refuses those actions for
    anyone else, and the app logs before touching the Auth admin API) or change admins; the user page hides those
    actions from regular admins.
  - *Reads:* `admin_stats`, `admin_users` (search, paging, per-user counts), `admin_user_detail`, `admin_feedback`,
    `admin_audit_log`, all typed in `src/lib/data/admin.ts`. Each starts with `assert_admin()` (42501 otherwise).
    Counts and dates only: no letter bodies, captions or files.
  - *Writes* (`src/actions/admin.ts`): feedback status/reply (`admin_update_feedback`), admin access, and suspend /
    lift / delete. The last three use the Auth admin API (service role); they write `admin_log` first, which is the
    database's admin check, and refuse your own account and other admins. Suspend is a Supabase ban
    (`ban_duration`); an already-issued access token keeps working until it expires (≤ 1 h). Delete removes photo
    files with `removeUserFiles` (`src/lib/user-files.ts`, the media store's `removeFolder`; also used by
    `deleteAccount`) and then the auth user (cascade). Storage numbers (`storage_bytes`, people near their space)
    come from `media_objects`; the limit on the overview card is `MEDIA_CAPACITY_BYTES`.
  - *Audit log:* `admin_audit` keeps the admin's and target's emails and has no cascading FK, so "who deleted
    whom" survives the deletion. The CSV export route (`admin/users/export/route.ts`) logs `users.export`; CSV
    fields are formula-escaped (`src/lib/csv.ts`).
  - *System tab:* which optional features are on and whether their env vars are set (never their values), the
    running commit (`HIDL_VERSION`, from the `GIT_SHA` build arg the deploy workflow passes), DB latency, uptime.
  - *Retention* (`..._admin_retention.sql`): `admin_stats()` also returns `letters_sealed`, `returning_30d` (active on
    2+ days of the last 30) and week-1 retention (`retention_d7` of `retention_cohort`: people who joined 8–37 days
    ago and came back 7–13 days after joining), all from `usage_daily`.
  - *Analytics tab* (`admin/analytics/page.tsx`): HogQL queries against PostHog's query API (`src/lib/posthog-api.ts`,
    server only, `POSTHOG_PERSONAL_API_KEY` with `query:read` + `POSTHOG_PROJECT_ID`, cached 10 min); pure shaping
    in `src/lib/analytics-format.ts`. Without the key it says what to set.
- **App hand-off code** (`..._app_handoff.sql`, `src/lib/app-code.ts`, `src/actions/app-handoff.ts`,
  `src/components/account/app-code-card.tsx`, `src/app/api/app/auth/code/route.ts`): Account → "Sign in on the phone
  app" (hidden inside the app itself) shows an 8-character code like `K7M2-Q9XP` (31-letter alphabet without
  0/O/1/I/L). Only its SHA-256 is stored (`app_handoffs`); it lives 10 minutes, works once, and a new one retires
  the old. The app posts it to `/api/app/auth/code`, which spends it in one call (`redeem_app_handoff`, service role,
  `FOR UPDATE`), re-checks the allowlist, then mints a session the way an emailed link would (`generateLink` +
  `verifyOtp`, nothing is emailed). Wrong, used and expired codes each get their own message. The website tab
  stays as it is.
- **Product analytics** (`src/components/analytics/analytics.tsx`): posthog-js, loaded lazily and only when
  `NEXT_PUBLIC_POSTHOG_KEY` is set (a build-time GitHub variable in production). Page views on history changes,
  `person_profiles: identified_only`, `respect_dnt`; **autocapture and session recording are off** because they'd read
  what's on screen (letters, captions). Mounted in the `(app)` layout (identifies by account id, never email), the
  marketing layout, and `/login` (resets, so the next person on the device starts fresh). PostHog adds country from
  the visitor's IP itself.
- **Profiles** (`..._profiles_leaderboard.sql`, `src/actions/profile.ts`, `src/components/profile/`): `profiles`
  gained `display_name` (unique ignoring case, rules in `display_name_ok()` ↔ `src/lib/profile-rules.ts`),
  and `show_on_leaderboard`; `avatar` is nullable so a row can hold only a name (`resetAvatar` now clears the
  column instead of deleting the row). Everyone is shown by their buddy: uploaded profile pictures (the public
  `avatars` bucket, `picture_path`) were removed in `..._remove_profile_pictures.sql`. `<ProfileImage>` draws the
  buddy (or Hidi's default); the side nav, phone header and leaderboard use it.
- **XP and streak freezes** (`..._xp_and_streak_freezes.sql`, `src/lib/xp.ts`, `src/lib/data/streak.ts`,
  `src/actions/streak.ts`): XP is computed, never stored, by `xp_by_day()` from photos, letters and countdowns with
  database-set timestamps, per day in the owner's zone: an on-time photo 10 (once a day), more photos +2 each (3 a
  day), a streak bonus of the streak's length (10 max), a letter 15 (once a day), opening a letter on its day 20 each,
  a countdown 5 (once a day). Deleting something takes its XP away; the daily caps stop farming. Spendable XP = all
  XP ever − freezes bought. `buy_streak_freeze()` (50 XP, hold 2; `HX001` not enough XP, `HX002` full).
  `my_streak()` (called by Today) spends one freeze per missed day up to yesterday, only if the freezes cover the
  whole gap, and returns the streak itself (`streak`, `today_done`), the balance, freezes and frozen days. The streak
  counts only *on-time* photo days (added on the day itself) and frozen days, the same days that earn the streak
  bonus: filling in past days saves the photos but never starts, lengthens or restores a streak, and uses no freeze.
  Today shows `my_streak()`'s count as is (no counting in the app). Frozen days keep the streak (the streak row shows
  them as ice) but earn nothing. `streak_freezes` has no grants. The flame on Today opens the
  freeze sheet.
- **Leaderboard** (`/leaderboard`, `leaderboard()` in SQL, `src/lib/data/leaderboard.ts`): ranks XP earned in the
  current week (Mon–Sun) or month, by `app_today()`; `streak` is still the longest run of *on-time* photo days in the
  period (on time = a photo whose `date` equals its `created_at` day in the owner's zone; backfills don't count).
  Ties share a rank (then the longer streak wins). The page shows a podium (the first three rows by position, so
  people tied for 3rd aren't hidden), your place with the XP to pass the next
  person, everyone else and "How XP works". Everyone is listed unless `show_on_leaderboard` is off; no name shows as "A hidl friend". Rows carry
  name, buddy and `is_me`, never ids or emails. The previous period is "released": the first call
  for it writes `leaderboard_releases` + top 100 into `leaderboard_results`, and later calls read that snapshot
  (names/buddies stay live; people who opted out since show anonymously). Desktop nav has a Leaderboard item; phones
  reach it from Today (the leaderboard card: place, XP, the gap to the next person, the top three faces) and Account.
- **App lock** (`src/lib/app-lock.ts`, `src/components/lock/`): optional, per device and per user. A 4–6 digit PIN
  or a 3×3 pattern (≥ 4 dots; crossing an unused dot adds it), hashed with PBKDF2-SHA256 (100k, random salt) into
  `localStorage["hidl-lock:<user id>"]`; the secret is never stored or sent. `<AppLockGate>` keeps the app mounted but
  hidden and `inert` behind the lock screen; it locks on a fresh tab/launch and when the app returns from the
  background after the chosen timeout (sessionStorage "seen" stamp). The `hidl-lock` cookie lists user ids with a
  lock on this device, so the server renders the page hidden from the first byte. Five wrong tries, then waits from
  30 s doubling to 15 min. "Forgot it?" clears the lock and signs out. It's a privacy screen, not encryption.
  Fingerprint / Face ID sits on top of the PIN or pattern: a passkey in browsers (`src/lib/passkey.ts`), or, in the
  phone app (whose web view has no passkeys), the phone's own prompt through the app (`src/lib/app-biometric.ts` ↔
  `mobile/src/biometric.ts`, expo-local-authentication; stored as `passkeyId: "hidl-app-biometric"`).
- **Account** (`/account`): a settings menu (Profile, Security, Preferences, Phone app on the website, Help, Delete
  account). Phones show the list, and each item opens alone at `/account?s=<id>` with a way back; wider screens show
  the menu beside the open section (Profile by default). Only the open section is rendered.
- **Themes** (`src/lib/theme.ts`, `src/components/theme/`): `teal` ("Teal Paper", the default, light) and
  `graphite` (dark). The old `blue` cookie value is read as `graphite`. The `hidl-theme` cookie is read by the root
  layout, which sets `<html data-theme>`, the browser `theme-color` and `color-scheme`, so the first paint is right;
  the OS dark mode is never used on its own. `applyTheme()` flips the attribute, the cookie and both meta tags in
  place (no reload); `useTheme()` watches the attribute so every switch on the page agrees. Graphite only overrides
  CSS variables in `globals.css`: `--white` becomes the charcoal card surface (so `bg-white` follows), `--ocean`
  turns light teal for headings and icons, and the button, text and line tokens are set explicitly. Hidi
  (`mascot.tsx`) and the `mint` buddy theme draw with `--hidi-*` variables and keep their teal in both themes;
  other buddy colors stay as chosen. Device-local on purpose, like the nav's collapsed state. The phone app copies
  both palettes in `mobile/src/theme.ts`; its web view page reports its theme (`REPORT_THEME` in `WebShell.tsx`)
  so the strips around the page, the status bar and the splash match.
- **Feedback** (`/feedback`, `src/components/feedback/feedback-form.tsx`, `sendFeedback`): kind + message; the
  side nav's Feedback link passes `?from=<path>` so a report says which page, and the action adds the browser's
  user agent. The page lists what you've sent with its status and any admin reply. The database sets
  status/reply/timestamps (trigger) and caps it at 10 a day.
- **Avatars:** each user can build a Hidi-style buddy on `/account` (`src/components/account/avatar-builder.tsx`):
  theme, eyes, mouth, top, accessory, background (option lists in `src/lib/avatar.ts`, drawn by
  `src/components/avatar.tsx`). Stored in `profiles.avatar` (`..._profiles_avatar.sql`, checked by `avatar_ok()`,
  which mirrors `AVATAR_PARTS`: change both together), **not** in user_metadata: the token's claims only update on
  a session refresh, so a save looked lost. The `(app)` layout reads it per request (`getAvatar`) and provides it
  via `BuddyProvider`; once a user has one, `<Mascot>` draws their buddy (in the same mood/pose) everywhere in the
  app except where it's passed `brand` (the header logo). No row = Hidi. Public pages have no provider, so they
  always show Hidi. The nav's Account icon shows the buddy (the default look until they make one).
- **Navigation:** on sm+ the nav is a left-side panel (`AppShell`/`SideNav` in `src/components/nav.tsx`) that
  collapses to icons only (a Gemini-style side-panel icon button, "Open sidebar" / "Close sidebar"); its state is the `hidl-nav` cookie (`src/lib/nav-cookie.ts`) so the server renders the
  right width. `AppShell` sets `--nav-w`; full-screen fixed overlays (the memories board) use
  `sm:left-[var(--nav-w)]` to stay clear of it. Phones keep the bottom tab bar.
- **Hidi's quick menu** (`src/components/hidi-menu.tsx`) is fixed in the bottom-right corner of every app page
  (above the tab bar on phones). Tapping it makes Hidi hop into the `hi` mood (big open smile, arms
  relaxed: no raised hand, on purpose) and fans out four shortcuts up and to the left. The camera one goes to `/calendar?add=today`, which opens today's upload sheet. `main` has extra
  bottom padding so pages can scroll clear of it; the dev-only Next.js badge is moved to top-right in
  `next.config.ts` for the same reason.
- **Countdown units:** each countdown stores `units` (any non-empty mix of years, months, days, hours; checked by
  `countdown_units_ok` in Postgres, mirrored in `src/lib/countdown-units.ts`). `timeLeft()` splits the time left
  into exactly those units (calendar years/months in the user's time zone, folding larger units into the largest
  chosen one), drops leading zeros, and falls back to a smaller unit rather than show all zeros. The form sends one
  `units` value per ticked box, so `saveCountdown` passes `formData.getAll("units")` to `parseCountdown`.
- Unsent letter drafts are kept in `localStorage` on the client until the letter is sealed (never hit the server
  unsealed, and never unencrypted: the letter form's textarea has no `name`; `seal()` posts the ciphertext).
- "Continue with Google" (`signInWithGoogle` in `src/actions/auth.ts`) is server-side PKCE: the action stores
  the verifier cookie and redirects to Google; Google returns to `/auth/confirm?code=…`, the same code path as
  default-template magic links. The button only renders when `googleSignInEnabled()`
  (`src/lib/auth-providers.ts`) sees Google enabled in Auth's public `/auth/v1/settings`. Because OAuth creates the
  `auth.users` row before the allowlist check, `/auth/confirm` deletes a just-created (< 2 min old) account that
  fails `ALLOWED_EMAIL`. Local Google is off in `supabase/config.toml`; see the comment there to enable it.
  **Through hidl's own address** (`src/lib/google-oauth.ts`, on when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are
  set): Google's account chooser names whatever domain it sends people back to, so instead of Supabase's callback,
  `startGoogle()` sends Google back to `/auth/google/callback` (website) or `/api/app/auth/google/callback` (phone
  app), with PKCE, a `state` and a hashed nonce kept in one httpOnly cookie (`hidl-google`, 10 min). The callback
  checks the state, swaps the code for Google's ID token on the server, and calls `signInWithIdToken` with the raw
  nonce; Supabase verifies the token against the same client. The allowlist check and cleanup are the same as
  above.
- The login page accepts two magic-link formats from Supabase (PKCE `?code=` from the default template, or a
  cross-device-safe link from the custom template in `supabase/templates/magic_link.html`) — see `/auth/confirm`.
- Mixing `pnpm build` and `pnpm dev` against the same `.next` directory can leave a stale cache that breaks
  `next/font/google` resolution under Turbopack dev (manifests as a 500 on first page load). Usually `rm -rf
  .next` fixes it; occasionally `node_modules/.cache` needs clearing too. This is a cache artifact, not an app bug.
- Public things are allowed through by name, not by a general rule, in two places: `src/proxy.ts`'s matcher
  skips static files (`icon.svg`, `manifest.webmanifest`, `sw.js`, `offline.html`, image extensions, …), and
  `updateSession` in `src/lib/supabase/proxy.ts` skips `PUBLIC_PATHS` plus `/api/cron` and `/api/widget`. A new
  unauthenticated static asset or public route must be added to the right one, or it 307s to `/login` instead of
  serving. This has already happened twice (the widget API, then `sw.js`).
- The PWA manifest/service worker (`src/app/manifest.ts`, `public/sw.js`, `RegisterServiceWorker` in
  `src/app/layout.tsx`) make the app installable ("Add to Home Screen"). The service worker never caches pages
  (every page is per-user and dynamic). It does two other things: caches **photo files** by storage path,
  ignoring the signed-URL token (photo paths are immutable, but the token changes on every render, so without
  this every visit re-downloaded every photo), wiped by `ClearPhotoCache` on `/login` (where sign-out and account
  deletion land); and serves `public/offline.html` when a navigation fails offline (with navigation preload, so
  online navigations aren't slowed). Bump the cache names in `sw.js` if the cached format changes. Installing
  doesn't create a separate session; it's the same origin and cookie jar as the browser.
- Performance rules this app relies on:
  - The app server and the Supabase project (`eu-central-1`, Frankfurt) should stay on the same continent: every
    page makes several round trips to the database. If either one moves, move the other too.
  - Client components must not import zod or anything that does (`src/lib/validation/*`, `src/lib/env.ts`).
    Browser code reads settings from `src/lib/public-env.ts`; shared constants used by forms live outside
    `validation/` (e.g. `detailField` in `countdown-kinds.ts`).
  - The upload sheet (Supabase browser client, ~70 KB) and photo viewer are loaded through
    `src/components/calendar/lazy.tsx` (`next/dynamic` + idle preload); import them from there, not directly.
  - Only Fredoka and Nunito are preloaded; Newsreader and Caveat load on the pages that use them.
  - Tab switching: the five nav tabs are `prefetch` (full: data + code) and `next.config.ts` sets
    `experimental.staleTimes` (dynamic 30s, static 120s), so a tab you tap or revisit renders from the client
    cache instead of waiting on the server. This is safe only because **every mutating server action calls
    `revalidatePath`**, which clears that cache; keep it that way for new actions. `LiveCountdown` therefore only
    applies the server-clock correction for skews over 5 minutes (a cached page isn't a wrong clock).
  - Photo prep (`src/lib/image.ts`): WebP encoding is feature-detected once; Safari can't encode WebP and would
    otherwise make (and discard) a large PNG per size. The thumbnail is drawn from the 1600px copy, not the
    original.
  - `/icon.svg` gets a real `Cache-Control` in `next.config.ts`; it's re-requested on every client navigation.
- CAPTCHA on the login form (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `src/app/(auth)/login/login-form.tsx`) is optional
  and entirely client-token-passthrough: the app never holds the Turnstile secret, only Supabase does
  (Authentication → Attack Protection). The token flows straight into `signInWithOtp`'s `captchaToken` option.
- `/memories` (`src/components/memories/memory-board.tsx`) is a full-screen pannable/zoomable board: one "island"
  per day, laid out by the pure, deterministic `layoutMemories()` in `src/lib/memories.ts` (newest day at the
  origin, islands spiral-packed so they never overlap; output is rounded so SSR and client markup match). Camera
  moves write straight to the DOM; React only re-renders when an island first nears the viewport (that's when its
  thumbnails load). The sky behind is a fixed gradient on the board with a few clouds drifting across it
  (`SkyClouds`: pictures in `public/clouds/cumulus-N.webp`, made by `scripts/generate-clouds.mjs` and served
  `immutable`, so rename the files if you regenerate them). The clouds are fixed to the screen, not the world, so
  panning doesn't move them; the drift is a CSS `translate` animation (`sky-drift`) the compositor runs, and with
  reduced motion they stand still, spread out. Only the world layer moves (no background repaint per frame). Loading order: the islands
  around the start position (`FIRST_VIEW`, a smaller box when the page says `phone`, from the user agent) are in
  the server HTML with `fetchPriority="high"`, so their photos download while the JS loads; islands just off
  screen are only added after those have loaded.
- **Memories by group.** Each person makes their own groups ("Family", "Trips", anything; no suggestions), in
  `photo_groups` (name rules in `src/lib/photo-groups.ts` ↔ `photo_group_name_ok()`, names unique ignoring case, 50
  per person) with `position` as their priority. A photo joins any number of them through `photo_group_items`, whose
  composite keys `(group_id, user_id)` and `(photo_id, user_id)` mean a photo and a group can only meet if they're the
  same person's. Membership is set in one call (`set_photo_groups`), the order too (`set_photo_group_order`). Groups
  are picked in the upload sheet or tapped in the photo viewer (`PhotoGroupPicker`, with "New group"; saved per tap by
  `setPhotoGroups`; the viewer refreshes the page once, on close, so the board doesn't regroup under it), and
  renamed, deleted and reordered in the board's "Edit groups" sheet (`groups-sheet.tsx`). Every picker reads one list
  (`photo-groups-store.ts`), so a group made in one place shows up everywhere. The "Gather photos" menu (the tiles button in the board's bottom bar:
  by day, by group, edit groups) re-runs `layoutMemories(photos, by, groupOrder)` on the client and records `?by=group` with `history.replaceState`; by
  group, the first group is in the middle and the rest spiral out in the person's order, a photo in two groups is on
  both islands, and ungrouped ones gather on "Not in a group". Opening a photo from a group island walks that island
  only.
- **The board's edge.** The middle of the screen is kept inside `boardRegion()` (the photos' bounding box *and* the
  circle around the origin holding every island, since the spiral is round and the box's corners are empty). A drag
  may pull up to `MAX_PULL` (72 px) past it, stiffer the further it goes, and springs back on release; a fling
  stops at the edge. Wheel, keys and zoom stop firmly.
- **The board's controls** are one bar at the bottom: the "Gather photos" menu, All (fit every island), Latest
  ("First group" when by group) and Share. All and Latest are a pair: the one matching the view is filled teal,
  and neither is once the board is moved by hand. There are no zoom buttons: pinch, ctrl+wheel and the + / − keys zoom. The title
  card at the top only names the page.
- **Share as a picture** (`share-sheet.tsx` + `snapshot.ts`, loaded on tap). The sheet offers a **day, a week or a
  month** (in the person's calendar, Gregorian or Ethiopian, `src/lib/share-periods.ts`, with arrows to step back and
  forward) and, on the board, **this view**. A period is drawn as Memory Lane (`drawLanePicture`): the board's sky and
  clouds, the title card, and every photo of the period framed (square photo, caption below) and laid out by
  `laneLayout()` (`src/lib/lane-layout.ts`) as big as they can be while all of them stay whole, in the shape of the
  screen it's made on (1080 px on the short side), with a day tag ("SAT 7") on each day's first photo in a week or
  month. Past 48 photos, `pickForPicture()` keeps each day's first photo, then fills up. `photosForShare(from, to)`
  loads the period's photos (at most 45 days). "This view" (`drawMemorySnapshot`) redraws the board exactly as on
  screen. Both draw from the theme's CSS variables and the page's fonts; photos are fetched with CORS (the media store
  allows the site's origin), which keeps the canvas exportable. The picture is then **copied** (as PNG, through the
  async clipboard), **downloaded** (a JPEG) or **shared** (Web Share with files). In the Android app the web view can do
  none of these, so the page posts the picture to the app: `share-image` (Android's share sheet, `expo-sharing`) or
  `save-image` (Android's folder picker, then the file is written there); see `mobile/src/share-image.ts`. Both are
  only announced (`hidlApp.shareImage` / `saveImage`) when the APK has those native modules. Copy in the app goes
  through the app too (`copy-image`, `expo-clipboard`, already in every APK, `hidlApp.copyImage`): a web view's clipboard
  can say it took a picture and still hold nothing, so without it the Copy button is hidden in the app. The Calendar
  page's Share button (`share-month-button.tsx`) opens the same sheet in calendar mode: only the calendar's month as
  the page shows it (`drawCalendarPicture`: each day's wallpaper filling its square, the date, "+N", today
  outlined), with arrows for other months; Memory Lane pictures are shared from Memories.
- The month calendar (`src/components/calendar/month-grid.tsx`) is sized to fit the viewport without scrolling:
  its height is `min(100dvh - --chrome, 1.8 x square-cell height)` using container query units (the page wrapper is an
  `@container`), so the cells stretch to fill the screen: tall on phones, wide on laptops. There is no card around
  the grid and no "days captured" line, on purpose: the pictures get the room (the page wrapper uses `-mx-3` on phones
  to go nearly edge to edge). If you add anything above or below the grid
  on `/calendar`, adjust `--chrome` or it will start scrolling again. On sm+ `--chrome` also reserves room under
  the grid for Hidi's corner menu, and the page's negative bottom margin cancels `main`'s bottom padding.
- "New" on `/countdown` opens a kind picker dialog (`new-countdown-button.tsx`, `kind-picker.tsx`) that links to
  `/countdown/new?kind=…`; without `?kind` that page shows the same picker inline.
- Visual language ("editorial calm"): warm paper `--paper` (#f5f3ee) pages, white cards with hairline `--line`
  borders and almost no shadow, teal used sparingly (`--teal` icons/progress, `--btn-face` #2e7c7f buttons with a
  4.9:1 white label), `--ocean` headings and big numbers, `--ink` (#17393d) a teal-tinted near-black for reading text, `--mint` (#e2f0ee) for soft highlights and the active nav item. Graphite
  is the same layout on charcoal (#121516 page, #1c2123 cards, #5cbdb6 teal with dark labels). Type: Newsreader
  page titles (`font-title`), Plus Jakarta Sans everywhere else, Fredoka only for the "Hidl" wordmark
  (`font-brand`, always `text-teal`). Photos carry their own overlays: white `text-snow` with a `--scrim` shade, never theme colors.
  `.btn` is flat with a small press. The memories board keeps its sky (`--sky-top`/`--sky-mid`, night-toned in
  Graphite). The calendar is a dense photo grid: portrait cells on phones and tablets (~4:5), on computers a 1200 × 950 board (edge-to-edge photos, thin lines, a teal weekday band; it scrolls on short screens), the
  date over each photo, "+N" for extra photos, plain numbers on empty days and a dashed "+" for today. Today
  (`src/app/(app)/page.tsx`, parts in `src/components/today/`) shows every feature even before it's used, as a
  picture rather than a paragraph, so a new person sees what hidl is for: one date in the chosen calendar, Hidi (a
  welcome line for someone with nothing yet; never repeating the streak), the streak row (`streak-row.tsx`: a flame
  that lights up once today has a photo, and the week as seven portrait tiles with each day's photo, today's a
  dashed "+" that opens the upload sheet; on phones the count sits on one line above the week so the photos get
  the width; `weekOf()` in `src/lib/calendar.ts`), the leaderboard card (`board-card.tsx`), the countdown (the nearest
  one ahead, with a progress bar from `created_at` and the next ones as two-per-row
  cards; a finished one only when nothing is ahead, for 3 days or until an exam's score is in; with none, a start
  button, plus the kinds to pick from on wider screens), today's photo (`today-photo.tsx`: the picture, or an empty page with a camera) and the letters
  envelope (`letter-tile.tsx`: ready, next sealed, or a blank one that starts a letter). Phones stack these with the
  photo and letter side by side; from `lg` it's a three-column grid with the photo standing tall on the right and
  this month's photo calendar (`month-glance.tsx`, in the chosen calendar) under the countdown. The blocks are the
  links (no "Open …" lines). `LiveCountdown` rolls its numbers in and, in the last 72 hours, ticks
  hours/minutes/seconds. The flame colors are `--flame`/`--flame-2`; every animation stops under
  `prefers-reduced-motion`. The mascot, Hidi, is `src/components/mascot.tsx`
  (moods: happy, wave, cheer, sleepy, curious); `src/app/icon.svg`, `public/icon-*.png` and `apple-touch-icon.png` are the full character on a mint tile (the
  PNGs are full-bleed with Hidi inside the maskable safe zone).
