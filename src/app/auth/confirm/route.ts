import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAllowedEmail } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { nextPathSchema } from "@/lib/validation/auth";

/**
 * Two link formats arrive here:
 * - `?token_hash=…&type=email` from the custom template (supabase/templates/magic_link.html).
 *   Works from any device or browser.
 * - `?code=…` from Supabase's default template (PKCE). Must be opened in the browser
 *   that requested the link, because the code verifier lives in that browser's cookies.
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

  let email: string | undefined;
  let next = "/";

  const byHash = tokenHashSchema.safeParse(params);
  const byCode = codeSchema.safeParse(params);

  if (byHash.success) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: byHash.data.token_hash,
      type: byHash.data.type as EmailOtpType,
    });
    if (error) return fail("expired-link");
    email = data.user?.email;
    next = byHash.data.next;
  } else if (byCode.success) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(byCode.data.code);
    if (error) return fail(error.code === "bad_code_verifier" || /verifier/i.test(error.message) ? "other-browser" : "expired-link");
    email = data.user?.email;
    next = byCode.data.next;
  } else {
    return fail(params.error_code === "otp_expired" ? "expired-link" : "invalid-link");
  }

  if (!isAllowedEmail(email)) {
    await supabase.auth.signOut();
    return fail("not-allowed");
  }

  return NextResponse.redirect(new URL(next, request.url));
}
