import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  // Cloudflare Turnstile site key for the login form. Unset in local dev skips the widget
  // entirely; Supabase only enforces the captcha when its own captcha setting is turned on.
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
});

const serverSchema = z.object({
  ALLOWED_EMAIL: z
    .string()
    .min(1)
    .transform((s) => s.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)),
});

// NEXT_PUBLIC_* must be referenced literally so Next can inline them into client bundles.
export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined,
});

export function serverEnv() {
  return serverSchema.parse({ ALLOWED_EMAIL: process.env.ALLOWED_EMAIL });
}

export function isAllowedEmail(email: string | null | undefined) {
  if (!email) return false;
  const allowed = serverEnv().ALLOWED_EMAIL;
  if (allowed.includes("*")) return true;
  return allowed.includes(email.toLowerCase());
}
