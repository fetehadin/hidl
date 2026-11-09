import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mediaStore } from "@/lib/storage";

/**
 * Removes every photo and video file in a user's folder (`<user_id>/...`), before the account is
 * deleted. Their media_objects records go with the account (on delete cascade). Returns how many
 * files it removed.
 */
export async function removeUserFiles(supabase: SupabaseClient, userId: string): Promise<number> {
  return mediaStore(supabase).removeFolder(userId);
}
