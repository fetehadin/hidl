/**
 * What a photo shows, for grouping the memories board "by kind". A fixed list, mirrored by
 * `photo_tags_ok()` in Postgres (supabase/migrations/20261110000005_photo_tags.sql): change both
 * together. Pure, so the browser can use it too.
 */
export const PHOTO_TAGS = ["nature", "places", "family", "friends", "food", "pets", "celebrations", "me"] as const;

export type PhotoTag = (typeof PHOTO_TAGS)[number];

/** A photo can be a few things at once (family at a dinner), but not everything. */
export const MAX_PHOTO_TAGS = 4;

export const PHOTO_TAG_INFO: Record<PhotoTag, { label: string; emoji: string }> = {
  nature: { label: "Nature", emoji: "🌿" },
  places: { label: "Historic places", emoji: "🏛️" },
  family: { label: "Family", emoji: "🏡" },
  friends: { label: "Friends", emoji: "🫶" },
  food: { label: "Food", emoji: "🍲" },
  pets: { label: "Pets", emoji: "🐾" },
  celebrations: { label: "Celebrations", emoji: "🎉" },
  me: { label: "Me", emoji: "🙂" },
};

export function isPhotoTag(value: unknown): value is PhotoTag {
  return typeof value === "string" && (PHOTO_TAGS as readonly string[]).includes(value);
}

/** Keeps known tags only, once each, in the list's order, at most MAX_PHOTO_TAGS. */
export function cleanPhotoTags(values: readonly unknown[] | null | undefined): PhotoTag[] {
  const set = new Set((values ?? []).filter(isPhotoTag));
  return PHOTO_TAGS.filter((t) => set.has(t)).slice(0, MAX_PHOTO_TAGS);
}

/** Adds or removes one tag. Adding past the limit changes nothing. */
export function togglePhotoTag(tags: readonly PhotoTag[], tag: PhotoTag): PhotoTag[] {
  if (tags.includes(tag)) return tags.filter((t) => t !== tag);
  if (tags.length >= MAX_PHOTO_TAGS) return [...tags];
  return cleanPhotoTags([...tags, tag]);
}
