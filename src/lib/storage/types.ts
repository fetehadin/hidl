/** Where the browser sends one file: a PUT to `url` with exactly these headers and the file as the body. */
export type UploadTarget = { path: string; url: string; headers: Record<string, string> };

/** What's really stored at a path. `head` is the file's first bytes (up to 32). */
export type StoredFile = { bytes: number; contentType: string; head: Uint8Array };

/**
 * The photo/video store, whichever provider holds the files. Callers check who may touch a path
 * first (src/lib/storage/index.ts and the photo actions); a store does what it's told.
 */
export interface MediaStore {
  readonly provider: "supabase" | "s3";
  /** A one-time upload link for a reserved path, locked to its size and type where the provider can. */
  uploadTarget(path: string, bytes: number, contentType: string): Promise<UploadTarget>;
  /** Short-lived view links, by path. Paths that can't be signed are left out. */
  viewUrls(paths: string[]): Promise<Map<string, string>>;
  /** The stored file, or null if nothing is there. */
  inspect(path: string): Promise<StoredFile | null>;
  remove(paths: string[]): Promise<void>;
  /** Removes everything under `<userId>/`. Returns how many files went. */
  removeFolder(userId: string): Promise<number>;
}

/** Upload links last 5 minutes; view links 15. Pages re-sign them (MediaLinkRefresher) before they expire. */
export const UPLOAD_LINK_SECONDS = 5 * 60;
export const VIEW_LINK_SECONDS = 15 * 60;

/** Stored with every file: paths are never reused (a replaced photo gets a new one). */
export const MEDIA_CACHE_CONTROL = "private, max-age=31536000, immutable";
