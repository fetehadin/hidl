/**
 * What a calendar entry's file can be. Shared by the upload sheet (browser) and the server
 * actions, so no zod here. The real limits live in Postgres and Storage (see
 * supabase/migrations/..._photo_videos.sql); these only mirror them.
 */
export type MediaType = "image" | "video";

/** The photos bucket's file_size_limit: 5 MB per file. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

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

/** "5 MB", "8.6 MB". */
export function formatMB(bytes: number) {
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
}
