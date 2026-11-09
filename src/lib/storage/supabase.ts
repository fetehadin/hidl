import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type MediaStore, type StoredFile, VIEW_LINK_SECONDS } from "./types";

export const PHOTO_BUCKET = "photos";

/**
 * The private `photos` bucket in Supabase Storage. Runs as the signed-in user (or the service role
 * for admin deletes), so Storage's own folder policies still apply on top of the app's checks.
 */
export function supabaseStore(supabase: SupabaseClient): MediaStore {
  const bucket = () => supabase.storage.from(PHOTO_BUCKET);

  return {
    provider: "supabase",

    async uploadTarget(path, _bytes, contentType) {
      // Storage itself caps files at 5 MB; the exact size is checked after the upload.
      const { data, error } = await bucket().createSignedUploadUrl(path);
      if (error || !data) throw error ?? new Error("No upload link");
      return {
        path,
        url: data.signedUrl,
        headers: { "content-type": contentType, "cache-control": "max-age=31536000", "x-upsert": "false" },
      };
    },

    async viewUrls(paths) {
      if (paths.length === 0) return new Map();
      const { data, error } = await bucket().createSignedUrls(paths, VIEW_LINK_SECONDS);
      if (error) throw error;
      return new Map(data.filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]));
    },

    async inspect(path): Promise<StoredFile | null> {
      const { data, error } = await bucket().createSignedUrl(path, 60);
      if (error || !data) return null;
      const res = await fetch(data.signedUrl, { headers: { Range: "bytes=0-31" }, cache: "no-store" });
      if (res.status === 404 || res.status === 400) return null;
      if (!res.ok) throw new Error(`Storage answered ${res.status}`);
      const head = new Uint8Array(await res.arrayBuffer()).slice(0, 32);
      const range = res.headers.get("content-range");
      const bytes = Number(range ? range.split("/")[1] : res.headers.get("content-length"));
      return { bytes, contentType: res.headers.get("content-type") ?? "", head };
    },

    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket().remove(paths);
      if (error) throw error;
    },

    async removeFolder(userId) {
      let removed = 0;
      // Each round lists from the start again: what was listed is gone by the next round.
      for (let round = 0; round < 1000; round++) {
        const { data, error } = await bucket().list(userId, { limit: 1000 });
        if (error) throw error;
        if (!data || data.length === 0) break;
        await this.remove(data.map((f) => `${userId}/${f.name}`));
        removed += data.length;
        if (data.length < 1000) break;
      }
      return removed;
    },
  };
}
