import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "@/lib/data/photos";

/**
 * Removes every file in a user's photo folder (`<user_id>/...`, flat). Storage lists 100 names
 * by default, so this pages through until the folder is empty. Returns how many it removed.
 */
export async function removeUserFiles(supabase: SupabaseClient, userId: string): Promise<number> {
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  let removed = 0;
  // Each round lists from the start again: what was listed is gone by the next round.
  for (let round = 0; round < 1000; round++) {
    const { data, error } = await bucket.list(userId, { limit: 1000 });
    if (error) throw error;
    if (!data || data.length === 0) break;
    const { error: removeError } = await bucket.remove(data.map((f) => `${userId}/${f.name}`));
    if (removeError) throw removeError;
    removed += data.length;
    if (data.length < 1000) break;
  }
  return removed;
}
