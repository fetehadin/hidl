import type { Session } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { APP_SECRET_COOKIE, APP_SECRET_PATTERN, sealForApp, toAppSession } from "@/lib/app-auth";
import { isAllowedEmail } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { finishGoogle, isDirectCallback } from "@/lib/google-oauth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const back = (query: string) => NextResponse.redirect(`hidl://auth?${query}`);

/**
 * Phone app, "Continue with Google" step 2. Google sends the person back here (in the app's
 * browser tab); we finish sign-in, check the allowlist, and send the session to the app,
 * encrypted with the app's secret (see sealForApp). The tab itself keeps no session.
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const secret = cookieStore.get(APP_SECRET_COOKIE)?.value ?? "";
  const params = request.nextUrl.searchParams;
  const code = params.get("code");

  const forgetTab = () => {
    // Drop this tab's copy of the session without revoking it (the app is about to use it).
    for (const c of cookieStore.getAll()) if (c.name.startsWith("sb-")) cookieStore.delete(c.name);
    cookieStore.delete({ name: APP_SECRET_COOKIE, path: "/api/app/auth" });
  };

  if (!APP_SECRET_PATTERN.test(secret)) return back("error=expired");
  const supabase = await createClient();
  let session: Session | null = null;

  if (isDirectCallback(params)) {
    // Google came straight back to hidl (src/lib/google-oauth.ts).
    const result = await finishGoogle("app", params);
    if (!result.ok) {
      forgetTab();
      return back(result.reason === "cancelled" ? "error=cancelled" : result.reason === "expired" ? "error=expired" : "error=google-failed");
    }
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: result.idToken, nonce: result.nonce });
    if (error) console.error("app google sign-in", error.message);
    session = data.session;
  } else {
    if (!code) {
      forgetTab();
      return back(params.get("error") === "access_denied" ? "error=cancelled" : "error=google-failed");
    }
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    session = data.session;
  }
  if (!session) {
    forgetTab();
    return back("error=google-failed");
  }
  const data = { session };

  const user = data.session.user;
  if (!isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    // Same cleanup as the website's /auth/confirm: remove an account this attempt just created.
    if (Date.now() - new Date(user.created_at).getTime() < 2 * 60_000) {
      await createAdminClient().auth.admin.deleteUser(user.id).catch(() => {});
    }
    forgetTab();
    return back("error=not-allowed");
  }

  const sealed = sealForApp(toAppSession(data.session), secret);
  forgetTab();
  return back(`sealed=${sealed}`);
}
