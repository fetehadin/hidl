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
- *Letter encryption* (`..._letter_encryption.sql`, `src/lib/e2ee.ts`): new letter bodies are end-to-end
  encrypted in the browser (`e2e1.<iv>.<ct>`, AES-256-GCM) with a per-user letter key. `letter_keys` holds that
  key only wrapped twice: by PBKDF2(passphrase) and by a recovery key shown once. The server never sees the
  passphrase, recovery key, raw key, or text: `createLetter` only accepts the ciphertext shape and sets
  `encrypted = true`. Anything that writes or reads an encrypted body sits inside `<LetterKeyGate>`
  (`src/components/letters/letter-key.tsx`: setup → recovery key → unlock), which provides `useLetterKey()`.
  The unlocked key is remembered per device as a non-extractable CryptoKey in IndexedDB (`src/lib/key-store.ts`),
  wiped on `/login` with the photo cache. Changing the passphrase re-wraps the *same* key (needs the current
  passphrase or the recovery key), so old letters still open. `open_letter` predates `encrypted`; read the flag
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
  function call) so that index is never transiently violated.
- *Cover photos*: `photos.is_cover` marks a day's pinned "wallpaper"; a partial unique index allows one per
  `(user_id, date)`, and `set_cover_photo(id, pinned)` moves it (clear-then-set, like `set_widget_countdown`).
  The calendar, dashboard and month grid show the pinned photo, falling back to the first one.
- *Widget tokens*: one row per feed. `countdown_id` null is the "starred countdown" feed; otherwise the token
  serves only that countdown (composite FK `(countdown_id, user_id)` → `countdowns (id, user_id)`, so it can't
  point at another user's countdown, and deleting the countdown deletes the token; `unique nulls not distinct
  (user_id, countdown_id)`). `widget_tokens.token_hash` has no `SELECT` grant to anyone, including its owner — same
  column-restriction pattern as `letters.body`. The public feed (`src/app/api/widget/countdown`) looks it up by
  `=` via the service-role client; nothing else can read it back. Generating one must use plain
  update-then-insert, not `.upsert()` — Postgres's `ON CONFLICT DO UPDATE` needs full-table `SELECT` to detect the
  conflict, which a column-restricted table can't satisfy (`src/actions/countdowns.ts` `generateWidgetToken`).
- Every table has RLS scoped to `user_id = auth.uid()`, and the `photos` storage bucket is split into per-user
  folders with matching storage policies.

**Account deletion** (`deleteAccount()` in `src/actions/auth.ts`) removes the user's storage files first (RLS
still applies, uses the user's own session), then deletes the `auth.users` row via `createAdminClient()`
(service-role, `src/lib/supabase/admin.ts`) — which cascades via `on delete cascade` to every user table:
`letters`, `letter_keys`, `photos`, `countdowns`, `widget_tokens`, and `profiles`. A new user table needs the same
`references auth.users (id) on delete cascade`, or account deletion leaves its rows behind. Covered end-to-end in `tests/integration/account-deletion.test.ts`.

**Photo upload is two-step and never passes through the app server, on purpose.** Images are resized client-side
(`src/lib/image.ts` `processMedia`: 1600px full image + 480px thumbnail, WebP or JPEG; videos ≤ 5 MB go up as-is
with a frame-grab thumbnail) and uploaded directly to Supabase Storage
via one-time signed URLs, never through the app server. The flow (`src/actions/photos.ts`):
1. `prepareUpload()` — issues a `createSignedUploadUrl` for both the image and the thumbnail.
2. (client uploads both files directly to Supabase Storage) — the upload sheet does steps 1–2 **in the
   background as soon as a photo is picked**, so Save usually only runs step 3. Files for a photo that's removed
   from the sheet, or never saved (the sheet closes), are deleted via `discardUpload()`, which only touches the
   user's own files and never ones a `photos` row points at. (A tab closed mid-way can still leave orphans.)
3. `addPhoto()` (new photo) or `replacePhoto()` (swap one photo's file by `id`) — verifies both paths match the
   user's folder pattern (`uploadPathsOk`) and that the files actually exist (`checkFilesUploaded`, using
   `createSignedUrls` as an existence check) before writing the DB row; deletes the uploaded files on any failure,
   and the photo's previous files on replace.

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
    truth) or from SQL (README → Admin panel); after that, from a user's page (`admin_set_admin`, which refuses removing yourself, so one always remains).
  - *Reads:* `admin_stats`, `admin_users` (search, paging, per-user counts), `admin_user_detail`, `admin_feedback`,
    `admin_audit_log`, all typed in `src/lib/data/admin.ts`. Each starts with `assert_admin()` (42501 otherwise).
    Counts and dates only: no letter bodies, captions or files.
  - *Writes* (`src/actions/admin.ts`): feedback status/reply (`admin_update_feedback`), admin access, and suspend /
    lift / delete. The last three use the Auth admin API (service role); they write `admin_log` first, which is the
    database's admin check, and refuse your own account and other admins. Suspend is a Supabase ban
    (`ban_duration`); an already-issued access token keeps working until it expires (≤ 1 h). Delete removes photo
    files with `removeUserFiles` (`src/lib/user-files.ts`, pages past Storage's 100-name list default; also used
    by `deleteAccount`) and then the auth user (cascade).
  - *Audit log:* `admin_audit` keeps the admin's and target's emails and has no cascading FK, so "who deleted
    whom" survives the deletion. The CSV export route (`admin/users/export/route.ts`) logs `users.export`; CSV
    fields are formula-escaped (`src/lib/csv.ts`).
  - *System tab:* which optional features are on and whether their env vars are set (never their values), the
    running commit (`HIDL_VERSION`, from the `GIT_SHA` build arg the deploy workflow passes), DB latency, uptime.
- **Profiles** (`..._profiles_leaderboard.sql`, `src/actions/profile.ts`, `src/components/profile/`): `profiles`
  gained `display_name` (unique ignoring case, rules in `display_name_ok()` ↔ `src/lib/profile-rules.ts`),
  `picture_path` and `show_on_leaderboard`; `avatar` is nullable so a row can hold only a name (`resetAvatar` now
  clears the column instead of deleting the row). A picture is cropped to a 320 px square in the browser
  (`processProfilePicture` in `src/lib/image.ts`), uploaded to the public `avatars` bucket with a signed URL
  (`preparePictureUpload` → upload → `setProfilePicture`, which checks the file exists and removes the old one).
  `<ProfileImage>` draws the picture or else the buddy; the side nav and phone header use it. `removeUserFiles`
  clears both buckets on account deletion.
- **Leaderboard** (`/leaderboard`, `leaderboard()` in SQL, `src/lib/data/leaderboard.ts`): ranks the longest run of
  consecutive *on-time* photo days in the current week (Mon–Sun) or month, by `app_today()`. On time = a photo whose
  `date` equals its `created_at` day in the owner's zone; backfills don't count. Ties share a rank (then more photo
  days wins). Everyone is listed unless `show_on_leaderboard` is off; no name shows as "A hidl friend". Rows carry
  name, buddy, picture path and `is_me`, never ids or emails. The previous period is "released": the first call
  for it writes `leaderboard_releases` + top 100 into `leaderboard_results`, and later calls read that snapshot
  (names/pictures stay live; people who opted out since show anonymously). Desktop nav has a Leaderboard item; phones
  reach it from Today (under the stats) and Account.
- **App lock** (`src/lib/app-lock.ts`, `src/components/lock/`): optional, per device and per user. A 4–6 digit PIN
  or a 3×3 pattern (≥ 4 dots; crossing an unused dot adds it), hashed with PBKDF2-SHA256 (100k, random salt) into
  `localStorage["hidl-lock:<user id>"]`; the secret is never stored or sent. `<AppLockGate>` keeps the app mounted but
  hidden and `inert` behind the lock screen; it locks on a fresh tab/launch and when the app returns from the
  background after the chosen timeout (sessionStorage "seen" stamp). The `hidl-lock` cookie lists user ids with a
  lock on this device, so the server renders the page hidden from the first byte. Five wrong tries, then waits from
  30 s doubling to 15 min. "Forgot it?" clears the lock and signs out. It's a privacy screen, not encryption.
- **Themes** (`src/lib/theme.ts`, `src/components/theme/`): `teal` (the original, default) and `blue` (bright modern
  blue: white page, light cyan `#a7ebf2` surfaces, ocean `#54acbf` highlights, steel `#26658c` buttons/icons, navy
  `#023859`/`#011c40` text only; Plus Jakarta Sans instead of Fredoka/Nunito, flatter buttons, quieter shadows). Both
  are light only; the OS dark mode never applies. The `hidl-theme` cookie is read by the root layout, which sets
  `<html data-theme>` and the browser `theme-color`, so the first paint is right. `applyTheme()` flips the attribute
  and cookie in place (no reload); `useTheme()` watches the attribute so every switch on the page agrees. The blue
  theme overrides the CSS variables in `globals.css` and adds depth through class hooks on components, which
  are inert in teal: `.surface-hero` (cyan gradient + soft rings: the dashboard countdown, featured countdowns,
  this week's leaderboard), `.surface-cyan` (highlighted cards), `.surface-feature` (steel blue → navy; it
  re-points the text tokens to light values inside, and restores them on cards/envelopes/fields placed on it),
  `.stat-chip`/`.stat-alt`/`.stat-icon` (white and cyan stat chips with blue icon discs), `.cd-tile`/`.cd-tile-lead`,
  `.nav-main`/`.nav-pill`/`.tabbar` (steel blue active item), and envelope `data-state` (sealed: steel edge,
  ready: cyan glow, opened: muted). Its page is `#e8f7f9` with soft cyan/ocean glows. Hidi (`mascot.tsx`) and the
  `mint` buddy theme (shown as "Hidi" in the builder) draw with `--hidi-*` variables; other buddy colors stay as
  chosen. Device-local on purpose, like the nav's collapsed state.
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
- The month calendar (`src/components/calendar/month-grid.tsx`) is sized to fit the viewport without scrolling:
  its height is `min(100dvh - --chrome, 1.8 x square-cell height)` using container query units (the page wrapper is an
  `@container`), so the cells stretch to fill the screen: tall on phones, wide on laptops. There is no card around
  the grid and no "days captured" line, on purpose: the pictures get the room (the page wrapper uses `-mx-3` on phones
  to go nearly edge to edge). If you add anything above or below the grid
  on `/calendar`, adjust `--chrome` or it will start scrolling again. On sm+ `--chrome` also reserves room under
  the grid for Hidi's corner menu, and the page's negative bottom margin cancels `main`'s bottom padding.
- "New" on `/countdown` opens a kind picker dialog (`new-countdown-button.tsx`, `kind-picker.tsx`) that links to
  `/countdown/new?kind=…`; without `?kind` that page shows the same picker inline.
- Visual language: a bright, **light-only** teal theme in `globals.css` (no dark mode on purpose: it renders light
  even when the OS prefers dark; `color-scheme: light` + `viewport.colorScheme`). Page is `--mint` with a white
  glow, cards/nav/fields are white with `--aqua` borders, a few feature cards are aqua (the memories board is the
  exception: a light sky, `--sky-top`/`--sky-mid`, with clouds),
  `--fresh` is for highlights/progress, `--teal` for buttons/icons/active, `--ocean` for headings and small
  important text. Never put large surfaces in teal/ocean or black (the photo viewer and dialog backdrops are light
  too). White on `--teal` is only 3.7:1, so primary button labels are large+bold (AA large text) and small teal
  text (`text-accent`, focus rings) uses `--ocean`. `.btn` is a chunky "arcade" button whose bottom edge collapses
  on press. The mascot, Hidi, is `src/components/mascot.tsx`
  (moods: happy, wave, cheer, sleepy, curious); `src/app/icon.svg`, `public/icon-*.png` and `apple-touch-icon.png` are the full character on a mint tile (the
  PNGs are full-bleed with Hidi inside the maskable safe zone).
