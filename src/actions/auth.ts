"use server";

import { redirect } from "next/navigation";
import { isAllowedEmail, publicEnv } from "@/lib/env";
import { PHOTO_BUCKET } from "@/lib/data/photos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUser } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  const { email } = parsed.data;
  const captchaToken = formData.get("captchaToken");

  // Same response either way so the form doesn't reveal which address is allowed.
  if (!isAllowedEmail(email)) return { status: "sent" };

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
      return { status: "error", message: "Verification failed. Try again." };
    }
    return { status: "error", message: "Couldn't send the link. Try again in a minute." };
  }
  return { status: "sent" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Permanently deletes the signed-in user: their storage files, then the auth
 * user itself (which cascades to letters, photos, and countdowns rows).
 */
export async function deleteAccount() {
  const { supabase, user } = await requireUser();

  const { data: files } = await supabase.storage.from(PHOTO_BUCKET).list(user.id);
  if (files && files.length > 0) {
    await supabase.storage.from(PHOTO_BUCKET).remove(files.map((f) => `${user.id}/${f.name}`));
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
