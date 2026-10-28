# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A private, single-user journal app for senior year: time-locked letters to your future self, an entrance-exam
countdown, and a one-photo-per-day image calendar. Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 +
Supabase (Auth, Postgres, Storage), designed to run entirely on free tiers (Vercel Hobby + Supabase free +
optional Resend free). Access is restricted to `ALLOWED_EMAIL` — it is not a multi-tenant app.

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

**Database-enforced invariants, not app-enforced.** The three features each push their hard rule into Postgres so
the app layer physically cannot violate it, even with a bug:
- *Letters* (`supabase/migrations/..._letters.sql`): `authenticated` has no `SELECT` grant on the `body` column at
  all — only `public.open_letter(id)`, a `SECURITY DEFINER` function, can return it, and only after checking
  `now() >= unlock_at` with the **database's** clock. Triggers (`letters_before_update`) make a letter immutable
  except `unlock_at`, which can only move later. `src/lib/data/letters.ts` mirrors this: `LETTER_META_COLUMNS`
  never includes `body`; reading it goes through `openLetter()` → the RPC, with `LetterSealedError` thrown on the
  `hint: "sealed"` error code.
- *Photos*: `UNIQUE (user_id, date)` plus a `photos_before_write` trigger that rejects future dates, using
  `app_today()` (Africa/Addis_Ababa) as the server-side source of truth.
- *Exam settings*: see `supabase/migrations/..._exam.sql`.
- Every table has RLS scoped to `user_id = auth.uid()`, and the `photos` storage bucket is split into per-user
  folders with matching storage policies.

**Photo upload is two-step and bypasses Vercel's body-size limit on purpose.** Images are resized client-side
(`src/lib/image.ts`: 1600px full image + 480px thumbnail, WebP or JPEG) and uploaded directly to Supabase Storage
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
supabase/migrations/   SQL schema: letters (lock), exam_settings, photos + storage bucket
supabase/templates/    Magic-link email template (only needed if using custom SMTP)
src/proxy.ts           Optimistic auth redirect (Next 16 "proxy", not middleware)
src/lib/supabase/      Server/browser Supabase clients; requireUser() is the real auth check
src/lib/data/          Typed queries (letters never select `body`)
src/lib/validation/    zod schemas shared by actions and route handlers
src/lib/time.ts        Africa/Addis_Ababa helpers; all timestamps elsewhere should go through this
src/lib/image.ts       Client-side resize/thumbnail before upload
src/actions/           Server actions (the only place that mutates data, alongside the cron route)
src/app/(auth)/login   Sign-in
src/app/(app)/         Dashboard, /letters, /countdown, /calendar — all require auth
src/app/api/cron/      Unlock-email job, behind ENABLE_UNLOCK_EMAILS
tests/unit/            Pure logic (time zones, calendar math) — no external services
tests/integration/     Real local Supabase: letter lock, one-photo-per-day, storage isolation, exam rules, emails
```

## Notes

- Unsent letter drafts are kept in `localStorage` on the client until the letter is sealed (never hit the server
  unsealed).
- The login page accepts two magic-link formats from Supabase (PKCE `?code=` from the default template, or a
  cross-device-safe link from the custom template in `supabase/templates/magic_link.html`) — see `/auth/confirm`.
- Mixing `pnpm build` and `pnpm dev` against the same `.next` directory can leave a stale cache that breaks
  `next/font/google` resolution under Turbopack dev (manifests as a 500 on first page load). `rm -rf .next` fixes
  it; this is a cache artifact, not an app bug.
