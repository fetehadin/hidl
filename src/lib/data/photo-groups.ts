import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhotoGroup } from "@/lib/photo-groups";

/** The person's groups, in their own order (first = most important). */
export async function listPhotoGroups(supabase: SupabaseClient): Promise<PhotoGroup[]> {
  const { data, error } = await supabase
    .from("photo_groups")
    .select("id, name")
    .order("position")
    .order("created_at");
  if (error) throw error;
  return data as PhotoGroup[];
}
