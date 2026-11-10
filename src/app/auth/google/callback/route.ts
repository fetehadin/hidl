import { type NextRequest, NextResponse } from "next/server";
import { isAllowedEmail, publicEnv } from "@/lib/env";
import { finishGoogle } from "@/lib/google-oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Website, "Continue with Google" through hidl's own address (src/lib/google-oauth.ts): Google
 * sends the person back here; we swap the code for Google's ID token, sign in with it, and check
 * the allowlist exactly as /auth/confirm does for the Supabase flow.
 */
export async function GET(request: NextRequest) {
  const go = (path: string) => NextResponse.redirect(new URL(path, publicEnv.NEXT_PUBLIC_SITE_URL));
  const result = await finishGoogle("web", request.nextUrl.searchParams);
  if (!result.ok) return go(`/login?error=${result.reason === "cancelled" ? "google-cancelled" : "google-failed"}`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: result.idToken,
    nonce: result.nonce,
  });
  if (error || !data.user) {
    console.error("google sign-in", error?.message);
    return go("/login?error=google-failed");
  }

  const user = data.user;
  if (!isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    // Same cleanup as /auth/confirm: remove an account this very attempt just created.
    if (Date.now() - new Date(user.created_at).getTime() < 2 * 60_000) {
      await createAdminClient().auth.admin.deleteUser(user.id).catch(() => {});
    }
    return go("/login?error=not-allowed");
  }
  return go(result.next);
}
