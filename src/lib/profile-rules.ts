// Display-name rules, shared by the profile form and the server action. Mirrors display_name_ok()
// in ..._profiles_leaderboard.sql: change both together. No zod here (client components use it).

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 24;
const RESERVED = /(admin|hidl|moderator|support)/i;

/** Trims and folds runs of spaces into one, the way the form saves a name. */
export function normalizeDisplayName(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

/** Why a (normalized) name isn't allowed, or null if it's fine. */
export function displayNameProblem(name: string): string | null {
  if (name.length < DISPLAY_NAME_MIN) return `Use at least ${DISPLAY_NAME_MIN} characters.`;
  if (name.length > DISPLAY_NAME_MAX) return `Keep it to ${DISPLAY_NAME_MAX} characters.`;
  if (/[\u0000-\u001f\u007f]/.test(name)) return "That name has characters we can't show.";
  if (!/[\p{L}\p{N}]/u.test(name)) return "Include at least one letter or number.";
  if (RESERVED.test(name)) return "That name is reserved. Pick another.";
  return null;
}

/** Where a profile picture lives in the public `avatars` bucket. */
export const AVATAR_BUCKET = "avatars";
export const PICTURE_MAX_BYTES = 512 * 1024;
export const PICTURE_EDGE = 320;

/** The public URL of a picture path (the bucket is public, so no signing). */
export function pictureUrl(supabaseUrl: string, path: string) {
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`;
}

/** A path this user may point their profile at: their own folder, the name the app generates. */
export function isOwnPicturePath(path: string, userId: string) {
  return new RegExp(`^${userId}/[0-9a-f]{16}\\.(webp|jpg)$`).test(path);
}
