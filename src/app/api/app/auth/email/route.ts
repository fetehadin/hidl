import type { NextRequest } from "next/server";
import { appError, appOk, statelessClient } from "@/lib/app-auth";
import { isAllowedEmail, publicEnv } from "@/lib/env";
import { appEmailStartSchema } from "@/lib/validation/app-auth";

export const dynamic = "force-dynamic";

/**
 * Phone app, email sign-in step 1: sends the sign-in email, which carries both the usual link
 * and a 6-digit code the app asks for. Same answer whether or not the address is allowed, so
 * the app can't be used to find out who has an account (as on the website's login form).
 */
export async function POST(request: NextRequest) {
  const parsed = appEmailStartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return appError(400, "invalid-email", "Enter a valid email address.");
  const { email } = parsed.data;
  if (!isAllowedEmail(email)) return appOk({});

  const { error } = await statelessClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/confirm` },
  });
  if (error) {
    console.error("app email sign-in", error.message);
    if (error.status === 429) return appError(429, "rate-limited", "Too many tries. Wait a minute and try again.");
    return appError(502, "send-failed", "Couldn't send the email. Try again in a minute.");
  }
  return appOk({});
}
