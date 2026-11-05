import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "@/lib/data/photos";
import { AVATAR_BUCKET } from "@/lib/profile-rules";

/**
 * Removes every file in a user's folders (`<user_id>/...`, flat) of the photos and profile
 * picture buckets. Returns how many it removed.
 */
export async function removeUserFiles(supabase: SupabaseClient, userId: string): Promise<number> {
  let removed = 0;
  for (const bucket of [PHOTO_BUCKET, AVATAR_BUCKET]) removed += await removeFolder(supabase, bucket, userId);
  return removed;
}

/** Storage lists 100 names by default, so this pages through until the folder is empty. */
async function removeFolder(supabase: SupabaseClient, bucketName: string, userId: string): Promise<number> {
  const bucket = supabase.storage.from(bucketName);
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
