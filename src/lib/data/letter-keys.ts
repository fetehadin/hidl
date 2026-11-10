import type { SupabaseClient } from "@supabase/supabase-js";
import type { KeyBundle } from "@/lib/e2ee";

export const KEY_BUNDLE_COLUMNS =
  "kdf_salt, kdf_iterations, passphrase_wrapped_key, recovery_wrapped_key, public_key, private_key_wrapped, email_wrapped_key, email_share";

/** The user's letter keys (every way in, all wrapped), or null if letters aren't set up yet. */
export async function getKeyBundle(supabase: SupabaseClient): Promise<KeyBundle | null> {
  const { data, error } = await supabase.from("letter_keys").select(KEY_BUNDLE_COLUMNS).maybeSingle();
  if (error) throw error;
  return data as KeyBundle | null;
}

export type LetterPasskey = { credential_id: string; wrapped_key: string; created_at: string };

/** Passkeys (fingerprint / Face ID) that unlock the user's letters. */
export async function getLetterPasskeys(supabase: SupabaseClient): Promise<LetterPasskey[]> {
  const { data, error } = await supabase
    .from("letter_passkeys")
    .select("credential_id, wrapped_key, created_at")
    .order("created_at");
  if (error) throw error;
  return data as LetterPasskey[];
}
