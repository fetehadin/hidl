import type { SupabaseClient } from "@supabase/supabase-js";
import type { KeyBundle } from "@/lib/e2ee";

/** The user's wrapped letter key, or null if they haven't set up encryption yet. */
export async function getKeyBundle(supabase: SupabaseClient): Promise<KeyBundle | null> {
  const { data, error } = await supabase
    .from("letter_keys")
    .select("kdf_salt, kdf_iterations, passphrase_wrapped_key, recovery_wrapped_key")
    .maybeSingle();
  if (error) throw error;
  return data as KeyBundle | null;
}
