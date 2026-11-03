# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal journal app (for anyone, not only students): time-locked letters to your future self, countdowns to any number of deadlines
(exams with a target score, or plain deadlines), and a photo calendar with any number of photos per day.
Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Supabase (Auth, Postgres, Storage), designed to run
entirely on free tiers (Vercel Hobby + Supabase free + optional Resend/Gmail SMTP). Access is restricted to
`ALLOWED_EMAIL` — a comma-separated allowlist, or `*` to let anyone sign up (the data model is already correctly
multi-tenant via RLS, so this is a real supported mode, not just a loophole). Anyone can permanently delete their
own account and everything in it from `/account`.

Everything meaningful about *why* a rule exists and *where* it's enforced is in the README's "How the important
rules are enforced" table — read that before touching letters, photos, or auth. The short version: correctness for
the sealing/locking rules lives in Postgres (RLS, column grants, triggers, `SECURITY DEFINER` functions), not in
application code, so the app can never accidentally bypass them.

## Commands

```bash
pnpm install
pnpm db:start              # local Supabase in Docker (Postgres, Auth, Storage, Studio, Mailpit); applies migrations
pnpm db:status              # prints local URLs/keys for .env.local
pnpm dev                    # dev server (Turbopack)

pnpm typecheck               # next typegen && tsc --noEmit
pnpm lint                    # eslint
pnpm test                    # unit tests (vitest project "unit")
pnpm test:integration        # integration tests against local Supabase (vitest project "integration"); needs db:start
pnpm test:all                # both

pnpm db:reset                # recreate local DB from supabase/migrations
pnpm exec supabase migration new <name>   # new migration file
```

Single test file: `pnpm vitest run tests/unit/time.test.ts` (or any path under `tests/unit` / `tests/integration`).
Integration tests refuse to run against a non-local Supabase URL (checked in `tests/integration/setup.ts`) and run
with `fileParallelism: false` (see `vitest.config.mts`) since they share one local database.

Before pushing: `pnpm typecheck && pnpm lint && pnpm test:all`. CI (`.github/workflows/ci.yml`) runs typecheck,
lint, and unit tests only (not integration, since it has no Docker/Supabase).

Database changes always go in a **new** migration file — never edit one that has already been pushed. Apply
locally with `pnpm db:reset`.

## Architecture

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
  except `unlock_at`, which can only move later. `src/lib/data/letters.ts` mirrors this: `LETTER_META_COLUMNS`
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
  using `app_today()` (Africa/Addis_Ababa) as the server-side source of truth. Actions are keyed by photo `id`,
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
(service-role, `src/lib/supabase/admin.ts`) — which cascades to `letters`, `photos`, and `countdowns` via
`on delete cascade`. Covered end-to-end in `tests/integration/account-deletion.test.ts`.

**Photo upload is two-step and bypasses Vercel's body-size limit on purpose.** Images are resized client-side
(`src/lib/image.ts` `processMedia`: 1600px full image + 480px thumbnail, WebP or JPEG; videos ≤ 5 MB go up as-is
with a frame-grab thumbnail) and uploaded directly to Supabase Storage
via one-time signed URLs, never through a Vercel function. The flow (`src/actions/photos.ts`):
1. `prepareUpload()` — issues a `createSignedUploadUrl` for both the image and the thumbnail.
2. (client uploads both files directly to Supabase Storage)
3. `savePhoto()` — verifies both paths match the user's folder pattern and that the files actually exist
   (`createSignedUrls` as an existence check) before writing the DB row; deletes orphaned files on any failure and
   deletes the previous day's files on replace.

**Time zone handling is centralized in `src/lib/time.ts`.** All timestamps are stored as `timestamptz` (UTC); all
display and "today" logic happens in `Africa/Addis_Ababa` via `@date-fns/tz`. Use `todayISO()` /
`nowInAppTz()` / `localToUtc()` / `utcToLocalInput()` rather than constructing `Date`s directly when a value will
be shown to or entered by the user — the countdown, calendar, and letter-unlock logic all depend on this being
consistent between client display and server validation.

**Validation (`src/lib/validation/*.ts`, zod) is the single schema every server action and route handler parses
input through** — there's no separate client-side-only validation path to keep in sync.

**Layout:**
```
supabase/migrations/   SQL schema: letters (lock), countdowns, widget_tokens, photos + storage bucket
supabase/templates/    Magic-link email template (only needed if using custom SMTP)
src/proxy.ts           Optimistic auth redirect (Next 16 "proxy", not middleware)
src/lib/supabase/      Server/browser Supabase clients; requireUser() is the real auth check;
                       admin.ts is the service-role client, used only for account deletion and the widget feed
src/lib/data/          Typed queries (letters never select `body`)
src/lib/validation/    zod schemas shared by actions and route handlers
src/lib/time.ts        Africa/Addis_Ababa helpers; all timestamps elsewhere should go through this
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

## Notes

- **Dates are Gregorian by default**; Ethiopian is a per-user option on `/account`, stored in
  `user_metadata.calendar` and read from the JWT claims by `requireUser()` (returned as `calendar`;
  `setCalendarPref` refreshes the session so the new claim applies at once). Server components get it from
  `requireUser()`; client components use `useCalendarPref()` / `useFormatDay()` from
  `src/components/calendar-pref.tsx` (the provider is in the `(app)` layout). Don't call `formatEthiopian`
  unconditionally for display; check the preference.
- **Navigation:** on sm+ the nav is a left-side panel (`AppShell`/`SideNav` in `src/components/nav.tsx`) that
  collapses to icons only; its state is the `hidl-nav` cookie (`src/lib/nav-cookie.ts`) so the server renders the
  right width. `AppShell` sets `--nav-w`; full-screen fixed overlays (the memories board) use
  `sm:left-[var(--nav-w)]` to stay clear of it. Phones keep the bottom tab bar.
- **Hidi's quick menu** (`src/components/hidi-menu.tsx`) is fixed in the bottom-right corner of every app page
  (above the tab bar on phones). Tapping it makes Hidi hop into the `hi` mood (big open smile, arms
  relaxed: no raised hand, on purpose) and fans out four shortcuts up and to the left. The camera one goes to `/calendar?add=today`, which opens today's upload sheet. `main` has extra
  bottom padding so pages can scroll clear of it; the dev-only Next.js badge is moved to top-right in
  `next.config.ts` for the same reason.
- **Countdown units:** each countdown stores `units` (any non-empty mix of years, months, days, hours; checked by
  `countdown_units_ok` in Postgres, mirrored in `src/lib/countdown-units.ts`). `timeLeft()` splits the time left
  into exactly those units (calendar years/months in Addis Ababa time, folding larger units into the largest
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
- `src/proxy.ts`'s matcher excludes known static files/paths by name (`icon.svg`, `manifest.webmanifest`,
  `sw.js`, `.../api/cron`, `.../api/widget`, …) rather than by a general rule. Any new unauthenticated static
  asset or public API route needs adding here explicitly, or it 307s to `/login` instead of serving — this has
  already happened twice (the widget API, then `sw.js`). `offline.html` is in it too.
- The PWA manifest/service worker (`src/app/manifest.ts`, `public/sw.js`, `RegisterServiceWorker` in
  `src/app/layout.tsx`) make the app installable ("Add to Home Screen"). The service worker never caches pages
  (every page is per-user and dynamic). It does two other things: caches **photo files** by storage path,
  ignoring the signed-URL token (photo paths are immutable, but the token changes on every render, so without
  this every visit re-downloaded every photo), wiped by `ClearPhotoCache` on `/login` (where sign-out and account
  deletion land); and serves `public/offline.html` when a navigation fails offline (with navigation preload, so
  online navigations aren't slowed). Bump the cache names in `sw.js` if the cached format changes. Installing
  doesn't create a separate session; it's the same origin and cookie jar as the browser.
- Performance rules this app relies on:
  - `vercel.json` pins functions to `cdg1` (Paris), next to the Supabase project (`eu-west-3`). Vercel's
    default region is Washington DC, which put an ocean between every query and the database. If the Supabase
    project ever moves, move this too.
  - Client components must not import zod or anything that does (`src/lib/validation/*`, `src/lib/env.ts`).
    Browser code reads settings from `src/lib/public-env.ts`; shared constants used by forms live outside
    `validation/` (e.g. `detailField` in `countdown-kinds.ts`).
  - The upload sheet (Supabase browser client, ~70 KB) and photo viewer are loaded through
    `src/components/calendar/lazy.tsx` (`next/dynamic` + idle preload); import them from there, not directly.
  - Only Fredoka and Nunito are preloaded; Newsreader and Caveat load on the pages that use them.
- CAPTCHA on the login form (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `src/app/(auth)/login/login-form.tsx`) is optional
  and entirely client-token-passthrough: the app never holds the Turnstile secret, only Supabase does
  (Authentication → Attack Protection). The token flows straight into `signInWithOtp`'s `captchaToken` option.
- `/memories` (`src/components/memories/memory-board.tsx`) is a full-screen pannable/zoomable board: one "island"
  per day, laid out by the pure, deterministic `layoutMemories()` in `src/lib/memories.ts` (newest day at the
  origin, islands spiral-packed so they never overlap; output is rounded so SSR and client markup match). Camera
  moves write straight to the DOM; React only re-renders when an island first nears the viewport (that's when its
  thumbnails load).
- The month calendar (`src/components/calendar/month-grid.tsx`) is sized to fit the viewport without scrolling:
  its height is `min(100dvh - --chrome, square-cell height)` using container query units (the page wrapper is an
  `@container`), so cells widen on laptops and stay square on phones. If you add anything above or below the grid
  on `/calendar`, adjust `--chrome` or it will start scrolling again. On sm+ `--chrome` also reserves room under
  the grid for Hidi's corner menu, and the page's negative bottom margin cancels `main`'s bottom padding.
- "New" on `/countdown` opens a kind picker dialog (`new-countdown-button.tsx`, `kind-picker.tsx`) that links to
  `/countdown/new?kind=…`; without `?kind` that page shows the same picker inline.
- Visual language: a bright, **light-only** teal theme in `globals.css` (no dark mode on purpose: it renders light
  even when the OS prefers dark; `color-scheme: light` + `viewport.colorScheme`). Page is `--mint` with a white
  glow, cards/nav/fields are white with `--aqua` borders, a few feature cards and memory islands are aqua,
  `--fresh` is for highlights/progress, `--teal` for buttons/icons/active, `--ocean` for headings and small
  important text. Never put large surfaces in teal/ocean or black (the photo viewer and dialog backdrops are light
  too). White on `--teal` is only 3.7:1, so primary button labels are large+bold (AA large text) and small teal
  text (`text-accent`, focus rings) uses `--ocean`. `.btn` is a chunky "arcade" button whose bottom edge collapses
  on press. The mascot, Hidi, is `src/components/mascot.tsx`
  (moods: happy, wave, cheer, sleepy, curious); `src/app/icon.svg`, `public/icon-*.png` and `apple-touch-icon.png` are the full character on a mint tile (the
  PNGs are full-bleed with Hidi inside the maskable safe zone).
