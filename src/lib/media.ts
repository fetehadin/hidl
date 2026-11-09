/**
 * What a calendar entry's file can be. Shared by the upload sheet (browser) and the server
 * actions, so no zod here. The real limits live in Postgres (media_objects and reserve_media in
 * supabase/migrations/..._media_objects.sql); these only mirror them.
 */
export type MediaType = "image" | "video";

/** 5 MB per file (media_objects_bytes_ok, and the old photos bucket's file_size_limit). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Each person's photo space: 2 GB (media_quota_bytes()). */
export const MEDIA_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;

/** From this share of their space on, a person sees how much they've used. */
export const MEDIA_QUOTA_WARN_AT = 0.9;

export const IMAGE_EXTS = ["webp", "jpg"] as const;
export const VIDEO_EXTS = ["mp4", "webm", "mov"] as const;
export type ImageExt = (typeof IMAGE_EXTS)[number];
export type VideoExt = (typeof VIDEO_EXTS)[number];
export type MediaExt = ImageExt | VideoExt;

export const VIDEO_MIME_TO_EXT: Record<string, VideoExt> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** The content type each file extension is stored with (mirrors media_objects_type_ok). */
export const CONTENT_TYPE_OF_EXT: Record<MediaExt, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/** "340 MB", "1.8 GB". */
export function formatSize(bytes: number) {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${Number(gb.toFixed(1))} GB`;
  return `${Math.max(0, Math.round(bytes / 1024 ** 2))} MB`;
}

/** "5 MB", "8.6 MB". */
export function formatMB(bytes: number) {
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
}
