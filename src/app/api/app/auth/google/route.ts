import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { APP_SECRET_COOKIE, APP_SECRET_PATTERN } from "@/lib/app-auth";
import { publicEnv } from "@/lib/env";
import { googleDirect, startGoogle } from "@/lib/google-oauth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Phone app, "Continue with Google" step 1. The app opens this in a secure browser tab with a
 * fresh random `secret`. We keep the secret in a short-lived cookie in that tab, then send the
 * person to Google (PKCE: the verifier also stays in that tab's cookies).
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret") ?? "";
  if (!APP_SECRET_PATTERN.test(secret)) return NextResponse.redirect("hidl://auth?error=invalid-request");

  (await cookies()).set(APP_SECRET_COOKIE, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/app/auth",
    maxAge: 10 * 60,
  });

  // Through hidl's own address when it's set up, so Google says "continue to hidl" (google-oauth.ts).
  if (googleDirect()) return NextResponse.redirect(await startGoogle("app"));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/api/app/auth/google/callback`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error("app google sign-in", error?.message);
    return NextResponse.redirect("hidl://auth?error=google-failed");
  }
  return NextResponse.redirect(data.url);
}
