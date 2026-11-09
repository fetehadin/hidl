import "server-only";
import { z } from "zod";

/**
 * Where photo and video files live. `supabase` = the private `photos` bucket in Supabase Storage;
 * `s3` = an S3-compatible store (Garage on the VPS, see docs/storage.md). Switching is one
 * environment variable and a restart, which is also the rollback.
 */
const schema = z.discriminatedUnion("STORAGE_PROVIDER", [
  z.object({
    STORAGE_PROVIDER: z.literal("supabase"),
    MEDIA_CAPACITY_BYTES: z.coerce.number().int().positive().default(1024 ** 3),
  }),
  z.object({
    STORAGE_PROVIDER: z.literal("s3"),
    /** What the browser uses (upload and view links are signed for this address). */
    S3_PUBLIC_URL: z.url(),
    /** What the server uses for its own checks and deletes; defaults to the public address. */
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().min(1).default("garage"),
    S3_BUCKET: z.string().min(1).default("hidl-media"),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    /** The store's size limit, for the admin panel (Garage's bucket quota). */
    MEDIA_CAPACITY_BYTES: z.coerce.number().int().positive(),
  }),
]);

export type StorageConfig = z.infer<typeof schema>;

export function storageConfig(): StorageConfig {
  const env = process.env;
  return schema.parse({
    STORAGE_PROVIDER: env.STORAGE_PROVIDER || "supabase",
    MEDIA_CAPACITY_BYTES: env.MEDIA_CAPACITY_BYTES || undefined,
    S3_PUBLIC_URL: env.S3_PUBLIC_URL,
    S3_ENDPOINT: env.S3_ENDPOINT || undefined,
    S3_REGION: env.S3_REGION || undefined,
    S3_BUCKET: env.S3_BUCKET || undefined,
    S3_ACCESS_KEY_ID: env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: env.S3_SECRET_ACCESS_KEY,
  });
}
