import type { SupabaseClient } from "@supabase/supabase-js";
import { type AvatarConfig, parseAvatar } from "@/lib/avatar";

export type Profile = {
  /** The buddy, or null for Hidi. */
  avatar: AvatarConfig | null;
  displayName: string | null;
  /** Path in the public `avatars` bucket, or null to show the buddy. */
  picturePath: string | null;
  showOnLeaderboard: boolean;
};

/** The signed-in user's own profile (RLS: only their row). No row = all defaults. */
export async function getProfile(supabase: SupabaseClient): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("avatar, display_name, picture_path, show_on_leaderboard")
    .maybeSingle();
  if (error) throw error;
  return {
    avatar: data?.avatar ? parseAvatar(data.avatar) : null,
    displayName: data?.display_name ?? null,
    picturePath: data?.picture_path ?? null,
    showOnLeaderboard: data?.show_on_leaderboard ?? true,
  };
}

/** The user's buddy, or null if they haven't made one (the app then shows Hidi). */
export async function getAvatar(supabase: SupabaseClient): Promise<AvatarConfig | null> {
  return (await getProfile(supabase)).avatar;
}
