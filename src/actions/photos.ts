"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { PHOTO_BUCKET, getPhotoById } from "@/lib/data/photos";
import type { ImageExt, MediaExt, MediaType } from "@/lib/media";
import { requireUser } from "@/lib/supabase/server";
import { todayISO } from "@/lib/time";
import {
  addPhotoSchema,
  captionSchema,
  photoIdSchema,
  prepareUploadSchema,
  replacePhotoSchema,
  uploadPathsOk,
} from "@/lib/validation/photos";

type Fail = { ok: false; message: string };

export type UploadTicket = {
  ok: true;
  image: { path: string; token: string };
  thumb: { path: string; token: string };
};

function revalidate() {
  revalidatePath("/calendar", "layout");
  revalidatePath("/");
}

/**
 * Step 1: hand out one-time signed upload URLs for the day's file (an image, or a video) and
 * its thumbnail (always an image). Storage itself refuses anything over 5 MB.
 */
export async function prepareUpload(date: string, fullExt: MediaExt, thumbExt: ImageExt): Promise<UploadTicket | Fail> {
  const parsed = prepareUploadSchema.safeParse({ date, fullExt, thumbExt });
  if (!parsed.success) return { ok: false, message: "Invalid upload." };
  const { supabase, user, timeZone } = await requireUser();
  if (parsed.data.date > todayISO(timeZone)) return { ok: false, message: "That day hasn't happened yet." };

  const base = `${user.id}/${parsed.data.date}-${randomBytes(8).toString("hex")}`;
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  const [image, thumb] = await Promise.all([
    bucket.createSignedUploadUrl(`${base}.${parsed.data.fullExt}`),
    bucket.createSignedUploadUrl(`${base}-thumb.${parsed.data.thumbExt}`),
  ]);
  if (image.error || thumb.error) {
    console.error("prepareUpload", image.error ?? thumb.error);
    return { ok: false, message: "Couldn't start the upload. Try again." };
  }
  return {
    ok: true,
    image: { path: image.data.path, token: image.data.token },
    thumb: { path: thumb.data.path, token: thumb.data.token },
  };
}

async function checkFilesUploaded(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], paths: string[]) {
  const check = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60);
  return !check.error && !check.data.some((d) => d.error);
}

/** Step 2a: record a new photo (or video) for a day. A day can have any number of them. */
export async function addPhoto(input: {
  date: string;
  mediaType?: MediaType;
  imagePath: string;
  thumbPath: string;
  caption?: string | null;
}): Promise<{ ok: true } | Fail> {
  const parsed = addPhotoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid photo." };
  const { date, mediaType, imagePath, thumbPath, caption } = parsed.data;
  const { supabase, user, timeZone } = await requireUser();
  if (date > todayISO(timeZone)) return { ok: false, message: "That day hasn't happened yet." };

  if (!uploadPathsOk(user.id, date, mediaType, imagePath, thumbPath)) {
    return { ok: false, message: "Invalid upload." };
  }

  if (!(await checkFilesUploaded(supabase, [imagePath, thumbPath]))) {
    return { ok: false, message: "The upload didn't finish. Try again." };
  }

  const { error } = await supabase.from("photos").insert({ date, media_type: mediaType, image_path: imagePath, thumb_path: thumbPath, caption });
  if (error) {
    console.error("addPhoto", error);
    await supabase.storage.from(PHOTO_BUCKET).remove([imagePath, thumbPath]);
    return { ok: false, message: "Couldn't save the photo." };
  }

  revalidate();
  return { ok: true };
}

/** Step 2b: swap a specific photo's file (for a photo or a video), keeping its date and caption. */
export async function replacePhoto(input: {
  id: string;
  mediaType?: MediaType;
  imagePath: string;
  thumbPath: string;
}): Promise<{ ok: true } | Fail> {
  const parsed = replacePhotoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid photo." };
  const { id, mediaType, imagePath, thumbPath } = parsed.data;

  const { supabase, user } = await requireUser();
  const existing = await getPhotoById(supabase, id);
  if (!existing) return { ok: false, message: "That photo no longer exists." };

  if (!uploadPathsOk(user.id, existing.date, mediaType, imagePath, thumbPath)) {
    return { ok: false, message: "Invalid upload." };
  }
  if (!(await checkFilesUploaded(supabase, [imagePath, thumbPath]))) {
    return { ok: false, message: "The upload didn't finish. Try again." };
  }

  const { error } = await supabase
    .from("photos")
    .update({ media_type: mediaType, image_path: imagePath, thumb_path: thumbPath })
    .eq("id", id);
  if (error) {
    console.error("replacePhoto", error);
    await supabase.storage.from(PHOTO_BUCKET).remove([imagePath, thumbPath]);
    return { ok: false, message: "Couldn't save the photo." };
  }

  await supabase.storage.from(PHOTO_BUCKET).remove([existing.image_path, existing.thumb_path]);
  revalidate();
  return { ok: true };
}

export async function updateCaption(input: { id: string; caption?: string | null }): Promise<{ ok: true } | Fail> {
  const parsed = captionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid caption." };

  const { supabase } = await requireUser();
  const { error, count } = await supabase
    .from("photos")
    .update({ caption: parsed.data.caption }, { count: "exact" })
    .eq("id", parsed.data.id);
  if (error || count === 0) return { ok: false, message: "Couldn't save the caption." };
  revalidate();
  return { ok: true };
}

export async function deletePhoto(id: string): Promise<{ ok: true } | Fail> {
  const parsed = photoIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: "Invalid photo." };

  const { supabase } = await requireUser();
  const photo = await getPhotoById(supabase, parsed.data);
  if (!photo) return { ok: true };

  const { error } = await supabase.from("photos").delete().eq("id", parsed.data);
  if (error) return { ok: false, message: "Couldn't delete the photo." };
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.image_path, photo.thumb_path]);
  revalidate();
  return { ok: true };
}

/** Pins a photo as its day's wallpaper (replacing any other pin that day), or unpins it. */
export async function setCoverPhoto(id: string, pinned: boolean): Promise<{ ok: true } | Fail> {
  const parsed = photoIdSchema.safeParse(id);
  if (!parsed.success || typeof pinned !== "boolean") return { ok: false, message: "Invalid photo." };

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_cover_photo", { photo_id: parsed.data, pinned });
  if (error) {
    console.error("setCoverPhoto", error);
    return { ok: false, message: "Couldn't pin that photo. Try again." };
  }
  revalidate();
  revalidatePath("/memories");
  return { ok: true };
}

/**
 * Deletes files uploaded in the background for a photo that was then removed or never saved
 * (the upload sheet starts uploading as soon as a photo is picked). Only the user's own files,
 * and never ones a saved photo still points at.
 */
export async function discardUpload(paths: string[]): Promise<void> {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > 2) return;
  const { supabase, user } = await requireUser();
  const own = new RegExp(`^${user.id}/\\d{4}-\\d{2}-\\d{2}-[a-z0-9]{10,}(-thumb)?\\.(webp|jpg|mp4|webm|mov)$`);
  const candidates = paths.filter((p) => typeof p === "string" && own.test(p));
  if (candidates.length === 0) return;
  const list = candidates.map((p) => `"${p}"`).join(",");
  const { data: used, error } = await supabase
    .from("photos")
    .select("image_path, thumb_path")
    .or(`image_path.in.(${list}),thumb_path.in.(${list})`);
  if (error) return; // when unsure, keep the files
  const inUse = new Set((used ?? []).flatMap((r) => [r.image_path, r.thumb_path]));
  const orphans = candidates.filter((p) => !inUse.has(p));
  if (orphans.length) await supabase.storage.from(PHOTO_BUCKET).remove(orphans);
}
