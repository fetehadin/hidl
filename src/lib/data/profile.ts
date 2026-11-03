import type { SupabaseClient } from "@supabase/supabase-js";
import { type AvatarConfig, parseAvatar } from "@/lib/avatar";

/** The user's buddy, or null if they haven't made one (the app then shows Hidi). */
export async function getAvatar(supabase: SupabaseClient): Promise<AvatarConfig | null> {
  const { data, error } = await supabase.from("profiles").select("avatar").maybeSingle();
  if (error) throw error;
  return data ? parseAvatar(data.avatar) : null;
}
