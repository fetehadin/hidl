"use server";

import { revalidatePath } from "next/cache";
import { formatEmailKey, fromB64Url } from "@/lib/e2ee";
import { letterKeyEmail } from "@/lib/letter-key-email";
import { publicEnv } from "@/lib/public-env";
import { requireUser } from "@/lib/supabase/server";
import { resendSender } from "@/lib/unlock-emails";
import {
  credentialIdSchema,
  emailKeyPartsSchema,
  emailKeySchema,
  keySetupSchema,
  keyUpgradeSchema,
  passkeySchema,
  passphraseUpdateSchema,
} from "@/lib/validation/encryption";

type Result = { ok: true } | { ok: false; message: string };

/**
 * First-time setup: the key pair and the email key made in the browser (src/lib/e2ee.ts), plus a
 * passphrase if the person chose one. Never overwrites: letters depend on these keys.
 */
export async function setupLetterKeys(input: unknown): Promise<Result> {
  const parsed = keySetupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Something went wrong setting up your letters. Try again." };

  const { supabase } = await requireUser();
  const { passphrase, ...keys } = parsed.data;
  const { error } = await supabase.from("letter_keys").insert({ ...keys, ...(passphrase ?? {}) });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Your letters are already set up. Reload the page." };
    console.error("setupLetterKeys", error);
    return { ok: false, message: "Couldn't save your letter keys. Try again." };
  }
  revalidatePath("/account");
  revalidatePath("/letters/new");
  return { ok: true };
}

/** For accounts from before the key pair and email key: adds what's missing (never replaces the pair). */
export async function upgradeLetterKeys(input: unknown): Promise<Result> {
  const parsed = keyUpgradeSchema.safeParse(input);
  if (!parsed.success || (!parsed.data.pair && !parsed.data.email)) return { ok: false, message: "Something went wrong." };

  const { supabase, user } = await requireUser();
  const { error, count } = await supabase
    .from("letter_keys")
    .update({ ...parsed.data.pair, ...parsed.data.email }, { count: "exact" })
    .eq("user_id", user.id);
  if (error || count === 0) {
    console.error("upgradeLetterKeys", error);
    return { ok: false, message: "Couldn't update your letter keys." };
  }
  revalidatePath("/account");
  revalidatePath("/letters/new");
  return { ok: true };
}

/** A new email key: the previous "letter key" email stops working once this is saved. */
export async function replaceEmailKey(input: unknown): Promise<Result> {
  const parsed = emailKeyPartsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Something went wrong." };

  const { supabase, user } = await requireUser();
  const { error, count } = await supabase.from("letter_keys").update(parsed.data, { count: "exact" }).eq("user_id", user.id);
  if (error || count === 0) {
    console.error("replaceEmailKey", error);
    return { ok: false, message: "Couldn't save the new key. Try again." };
  }
  revalidatePath("/account");
  return { ok: true };
}

/** Sets or changes the passphrase (the same letter key, wrapped again). */
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
    return { ok: false, message: "Couldn't save the passphrase. Try again." };
  }
  revalidatePath("/account");
  return { ok: true };
}

/** Saves a passkey (fingerprint / Face ID) as a way into letters. */
export async function addLetterPasskey(input: unknown): Promise<Result> {
  const parsed = passkeySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Something went wrong." };

  const { supabase } = await requireUser();
  // The same passkey made again (same device and account) replaces its old row.
  await supabase.from("letter_passkeys").delete().eq("credential_id", parsed.data.credential_id);
  const { error } = await supabase.from("letter_passkeys").insert(parsed.data);
  if (error) {
    if (error.code === "53400") return { ok: false, message: "You have 10 passkeys already. Remove one on Account first." };
    console.error("addLetterPasskey", error);
    return { ok: false, message: "Couldn't save the passkey. Try again." };
  }
  revalidatePath("/account");
  return { ok: true };
}

export async function removeLetterPasskey(input: unknown): Promise<Result> {
  const parsed = credentialIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Something went wrong." };

  const { supabase } = await requireUser();
  const { error } = await supabase.from("letter_passkeys").delete().eq("credential_id", parsed.data);
  if (error) {
    console.error("removeLetterPasskey", error);
    return { ok: false, message: "Couldn't remove it. Try again." };
  }
  revalidatePath("/account");
  return { ok: true };
}

/**
 * Emails the person their half of the email key. It's used to build the email and then
 * dropped: never stored, never logged (errors log the Resend status only).
 */
export async function emailLetterKey(input: unknown): Promise<Result> {
  const parsed = emailKeySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Something went wrong." };

  const { user } = await requireUser();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!user.email || !apiKey || !from) {
    return { ok: false, message: "Couldn't send email from here. Save the key below instead." };
  }
  const { key } = parsed.data;
  try {
    const email = letterKeyEmail(publicEnv.NEXT_PUBLIC_SITE_URL, key, formatEmailKey(fromB64Url(key)));
    await resendSender(apiKey, from)({ to: user.email, ...email });
  } catch (e) {
    console.error("emailLetterKey", e instanceof Error ? e.message.slice(0, 60) : "failed");
    return { ok: false, message: "Couldn't send the email. Try again, or save the key below." };
  }
  return { ok: true };
}
