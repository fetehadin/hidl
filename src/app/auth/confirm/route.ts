import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedEmail } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { nextPathSchema } from "@/lib/validation/auth";

/**
 * Two link formats arrive here:
 * - `?token_hash=…&type=email` from the custom template (supabase/templates/magic_link.html).
 *   Works from any device or browser.
 * - `?code=…` from Supabase's default template (PKCE), and from "Continue with Google"
 *   (src/actions/auth.ts signInWithGoogle). Must be opened in the browser that started it,
 *   because the code verifier lives in that browser's cookies.
 * A cancelled or failed Google sign-in comes back as `?error=…&error_description=…`.
 */
const tokenHashSchema = z.object({
  token_hash: z.string().min(1),
  type: z.enum(["email", "magiclink", "signup"]),
  next: nextPathSchema,
});
const codeSchema = z.object({ code: z.string().min(1), next: nextPathSchema });

export async function GET(request: NextRequest) {
  const fail = (code: string) =>
    NextResponse.redirect(new URL(`/login?error=${code}`, request.url));

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const supabase = await createClient();

  let user: { id: string; email?: string; created_at: string } | null | undefined;
  let next = "/";

  const byHash = tokenHashSchema.safeParse(params);
  const byCode = codeSchema.safeParse(params);

  if (byHash.success) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: byHash.data.token_hash,
      type: byHash.data.type as EmailOtpType,
    });
    if (error) return fail("expired-link");
    user = data.user;
    next = byHash.data.next;
  } else if (byCode.success) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(byCode.data.code);
    if (error) return fail(error.code === "bad_code_verifier" || /verifier/i.test(error.message) ? "other-browser" : "expired-link");
    user = data.user;
    next = byCode.data.next;
  } else if (params.error === "access_denied" && params.error_code !== "otp_expired") {
    return fail("google-cancelled"); // closed or declined on Google's screen
  } else if (params.error && params.error_code !== "otp_expired") {
    return fail("google-failed");
  } else {
    return fail(params.error_code === "otp_expired" ? "expired-link" : "invalid-link");
  }

  if (!isAllowedEmail(user?.email)) {
    await supabase.auth.signOut();
    // Magic links are only ever sent to allowed addresses, but Google sign-in creates the
    // account before we can check. Remove an account this very attempt just created, so
    // turned-away visitors don't pile up in auth.users. Older accounts are left alone (they
    // may hold data from before the allowlist changed).
    if (user && Date.now() - new Date(user.created_at).getTime() < 2 * 60_000) {
      await createAdminClient().auth.admin.deleteUser(user.id).catch(() => {});
    }
    return fail("not-allowed");
  }

  return NextResponse.redirect(new URL(next, request.url));
}
