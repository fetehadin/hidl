"use server";

import { redirect } from "next/navigation";
import { isAllowedEmail, publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  const { email } = parsed.data;
  // Same response either way so the form doesn't reveal which address is allowed.
  if (!isAllowedEmail(email)) return { status: "sent" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/confirm` },
  });

  if (error) {
    console.error("signInWithOtp failed", error.message);
    return { status: "error", message: "Couldn't send the link. Try again in a minute." };
  }
  return { status: "sent" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
