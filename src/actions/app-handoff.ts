"use server";

import { formatAppCode, hashAppCode, newAppCode } from "@/lib/app-code";
import { requireUser } from "@/lib/supabase/server";

export type AppCodeResult = { ok: true; code: string; expiresAt: string } | { ok: false; message: string };

/**
 * "Get a code" on Account: a one-time code to type into the phone app's sign-in screen. Only its
 * hash is stored; making a new one retires the last. Nothing on any page changes, so no
 * revalidatePath (the code is shown from this return value only).
 */
export async function createAppCode(): Promise<AppCodeResult> {
  const { supabase } = await requireUser();
  const code = newAppCode();
  const { data, error } = await supabase.rpc("create_app_handoff", { p_code_hash: hashAppCode(code) });
  if (error) {
    if (error.code === "53400") return { ok: false, message: "That's a lot of codes. Try again in an hour." };
    console.error("createAppCode", error);
    return { ok: false, message: "Couldn't make a code. Try again." };
  }
  return { ok: true, code: formatAppCode(code), expiresAt: data as string };
}
