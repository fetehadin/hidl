/**
 * The NEXT_PUBLIC_* settings, safe to import from client components. Validated by hand
 * rather than with zod so the browser bundle doesn't carry a schema library just for
 * four strings (src/lib/env.ts keeps zod for the server-only settings).
 */

function url(name: string, value: string | undefined, fallback?: string) {
  const v = value || fallback;
  if (!v || !URL.canParse(v)) throw new Error(`${name} must be set to a full URL (got ${JSON.stringify(value)}).`);
  return v;
}

function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`${name} must be set.`);
  return value;
}

// NEXT_PUBLIC_* must be referenced literally so Next can inline them into client bundles.
export const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: url("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  NEXT_PUBLIC_SITE_URL: url("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL, "http://localhost:3000"),
  // Cloudflare Turnstile site key for the login form. Unset in local dev skips the widget
  // entirely; Supabase only enforces the captcha when its own captcha setting is turned on.
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined,
  // PostHog project token (public, write-only). Unset turns analytics off.
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY || undefined,
  NEXT_PUBLIC_POSTHOG_HOST: url("NEXT_PUBLIC_POSTHOG_HOST", process.env.NEXT_PUBLIC_POSTHOG_HOST, "https://us.i.posthog.com"),
} as const;
