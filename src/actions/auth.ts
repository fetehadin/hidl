"use server";

import { redirect } from "next/navigation";
import { isAllowedEmail, publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUser } from "@/lib/supabase/server";
import { removeUserFiles } from "@/lib/user-files";
import { emailCodeSchema, loginSchema } from "@/lib/validation/auth";
import { googleDirect, startGoogle } from "@/lib/google-oauth";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const TOO_MANY = "Lots of emails were just sent. Wait a minute, then try again.";

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  const { email } = parsed.data;
  const captchaToken = formData.get("captchaToken");

  // Same response either way so the form doesn't reveal which address is allowed.
  if (!isAllowedEmail(email)) return { status: "sent", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
      captchaToken: typeof captchaToken === "string" && captchaToken ? captchaToken : undefined,
    },
  });

  if (error) {
    console.error("signInWithOtp failed", error.message);
    if (/captcha/i.test(error.message)) {
      return { status: "error", message: "Verification failed. Try again.", email };
    }
    if (error.status === 429) return { status: "error", message: TOO_MANY, email };
    return { status: "error", message: "Couldn't send the email. Try again in a minute.", email };
  }
  return { status: "sent", email };
}

export type CodeState = { status: "idle" | "error"; message?: string };

/**
 * Signs in with the 6-digit code from the sign-in email, as the phone app does: quicker than
 * opening the link, and it works when the link would open in a different browser.
 */
export async function verifyEmailCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const parsed = emailCodeSchema.safeParse({ email: formData.get("email"), code: formData.get("code") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: "email" });
  if (error || !data.user) {
    if (error?.status === 429) return { status: "error", message: TOO_MANY };
    return { status: "error", message: "That code didn't work. Check it, or send a new one." };
  }
  // Codes only go to allowed addresses, but the allowlist can change in between.
  if (!isAllowedEmail(data.user.email)) {
    await supabase.auth.signOut();
    return { status: "error", message: "This journal is private." };
  }
  redirect("/");
}

/**
 * Starts "Continue with Google". With GOOGLE_CLIENT_ID/SECRET set, hidl talks to Google itself
 * (src/lib/google-oauth.ts → /auth/google/callback). Otherwise Supabase handles the Google side; Google sends the person
 * back to /auth/confirm with a one-time code (PKCE; the verifier is stored in a cookie
 * here), which is exchanged for a session and checked against ALLOWED_EMAIL there.
 */
export async function signInWithGoogle() {
  // Through hidl's own address when it's set up, so Google says "continue to hidl" (google-oauth.ts).
  if (googleDirect()) redirect(await startGoogle("web", "/"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
      // Always show Google's account chooser, so someone with several accounts picks the right one.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error("signInWithOAuth failed", error?.message);
    redirect("/login?error=google-failed");
  }
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?mode=signin");
}

/**
 * Permanently deletes the signed-in user: their storage files, then the auth
 * user itself (which cascades to letters, photos, and countdowns rows).
 */
export async function deleteAccount() {
  const { supabase, user } = await requireUser();

  // Pages through the folder (a plain list() stops at 100 files, which left the rest behind).
  try {
    await removeUserFiles(supabase, user.id);
  } catch (error) {
    console.error("deleteAccount files", error);
    redirect("/account?error=delete-failed");
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("deleteAccount failed", error.message);
    redirect("/account?error=delete-failed");
  }

  await supabase.auth.signOut();
  redirect("/login?deleted=1");
}
