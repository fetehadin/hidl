"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { keyBundleSchema, passphraseUpdateSchema } from "@/lib/validation/encryption";

type Result = { ok: true } | { ok: false; message: string };

/** First-time setup. Stores the wrapped letter key made in the browser (see src/lib/e2ee.ts). */
export async function setupLetterKey(input: unknown): Promise<Result> {
  const parsed = keyBundleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Something went wrong setting up encryption. Try again." };

  const { supabase } = await requireUser();
  const { error } = await supabase.from("letter_keys").insert(parsed.data);
  if (error) {
    // 23505: already set up (e.g. in another tab). Never overwrite: letters depend on that key.
    if (error.code === "23505") return { ok: false, message: "Encryption is already set up. Reload the page." };
    console.error("setupLetterKey", error);
    return { ok: false, message: "Couldn't save your encryption key. Try again." };
  }
  revalidatePath("/account");
  return { ok: true };
}

/** Swaps the passphrase-wrapped copy of the same letter key; the recovery copy stays. */
export async function changePassphrase(input: unknown): Promise<Result> {
  const parsed = passphraseUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Something went wrong. Try again." };

  const { supabase, user } = await requireUser();
  const { error, count } = await supabase
    .from("letter_keys")
    .update(parsed.data, { count: "exact" })
    .eq("user_id", user.id);
  if (error || count === 0) {
    console.error("changePassphrase", error);
    return { ok: false, message: "Couldn't change the passphrase. Try again." };
  }
  revalidatePath("/account");
  return { ok: true };
}
