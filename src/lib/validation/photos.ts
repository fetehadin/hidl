import { z } from "zod";

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date.")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, "Invalid date.");

export const monthParam = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .optional()
  .catch(undefined);

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

export const addPhotoSchema = z.object({
  date: isoDate,
  imagePath: z.string().min(1).max(200),
  thumbPath: z.string().min(1).max(200),
  caption,
});

export const replacePhotoSchema = z.object({
  id: photoIdSchema,
  imagePath: z.string().min(1).max(200),
  thumbPath: z.string().min(1).max(200),
});

export const captionSchema = z.object({ id: photoIdSchema, caption });

/** Storage paths must be <uid>/<date>-<random>[-thumb].<ext> inside the user's folder. */
export function photoPathPattern(userId: string, date: string) {
  return new RegExp(`^${userId}/${date}-[a-z0-9]{10,}(-thumb)?\\.(webp|jpg)$`);
}
