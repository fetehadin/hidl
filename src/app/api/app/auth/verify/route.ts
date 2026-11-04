import type { NextRequest } from "next/server";
import { appError, appOk, statelessClient, toAppSession } from "@/lib/app-auth";
import { isAllowedEmail } from "@/lib/env";
import { appEmailVerifySchema } from "@/lib/validation/app-auth";

export const dynamic = "force-dynamic";

/** Phone app, email sign-in step 2: trades the 6-digit code from the email for a session. */
export async function POST(request: NextRequest) {
  const parsed = appEmailVerifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return appError(400, "invalid-code", parsed.error.issues[0]?.message ?? "Check the code.");
  const { email, code } = parsed.data;

  const supabase = statelessClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.session) {
    if (error?.status === 429) return appError(429, "rate-limited", "Too many tries. Wait a minute and try again.");
    return appError(401, "wrong-code", "That code didn't work. Check it, or send a new one.");
  }
  // Codes only go to allowed addresses, but the allowlist can change in between.
  if (!isAllowedEmail(data.session.user.email)) {
    await supabase.auth.signOut();
    return appError(403, "not-allowed", "This journal is private.");
  }
  return appOk({ session: toAppSession(data.session) });
}
