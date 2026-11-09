import { z } from "zod";
import { IMAGE_EXTS, MAX_UPLOAD_BYTES, VIDEO_EXTS } from "@/lib/media";

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, "Invalid date.");
export const yearParam = z.coerce.number().int().min(2000).max(2100).optional().catch(undefined);

export const caption = z
  .string()
  .trim()
  .max(140, "Keep the caption under 140 characters.")
  .transform((s) => (s === "" ? null : s))
  .nullable()
  .optional()
  .transform((s) => s ?? null);

export const photoIdSchema = z.uuid();

export const mediaTypeSchema = z.enum(["image", "video"]).default("image");

export const addPhotoSchema = z.object({
  date: isoDate,
  mediaType: mediaTypeSchema,
  imagePath: z.string().min(1).max(200),
  thumbPath: z.string().min(1).max(200),
  caption,
});

export const replacePhotoSchema = z.object({
  id: photoIdSchema,
  mediaType: mediaTypeSchema,
  imagePath: z.string().min(1).max(200),
  thumbPath: z.string().min(1).max(200),
});

const fileSize = z.number().int().min(1).max(MAX_UPLOAD_BYTES);

export const prepareUploadSchema = z.object({
  date: isoDate,
  full: z.object({ ext: z.enum([...IMAGE_EXTS, ...VIDEO_EXTS]), bytes: fileSize }),
  thumb: z.object({ ext: z.enum(IMAGE_EXTS), bytes: fileSize }),
});

export const captionSchema = z.object({ id: photoIdSchema, caption });

const ALL_EXTS = [...IMAGE_EXTS, ...VIDEO_EXTS].join("|");

/** Storage paths must be <uid>/<date>-<random>[-thumb].<ext> inside the user's folder. */
export function photoPathPattern(userId: string, date: string) {
  return new RegExp(`^${userId}/${date}-[a-z0-9]{10,}(-thumb)?\\.(${ALL_EXTS})$`);
}

/**
 * Both paths are in the user's folder for that day, the thumbnail is an image named -thumb,
 * and the main file is the kind the row says it is (mirrors photos_media_matches_path).
 */
export function uploadPathsOk(userId: string, date: string, mediaType: "image" | "video", imagePath: string, thumbPath: string) {
  const pattern = photoPathPattern(userId, date);
  if (!pattern.test(imagePath) || !pattern.test(thumbPath) || imagePath === thumbPath) return false;
  if (imagePath.includes("-thumb.") || !new RegExp(`-thumb\\.(${IMAGE_EXTS.join("|")})$`).test(thumbPath)) return false;
  const exts = mediaType === "video" ? VIDEO_EXTS : IMAGE_EXTS;
  return new RegExp(`\\.(${exts.join("|")})$`).test(imagePath);
}
