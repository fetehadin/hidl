"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { type PhotoView, getPhotoById, listPhotos, signPhotos } from "@/lib/data/photos";
import { CONTENT_TYPE_OF_EXT, type ImageExt, MEDIA_QUOTA_BYTES, type MediaExt, type MediaType, formatSize } from "@/lib/media";
import { type UploadTarget, discardMedia, mediaStore, mediaUsage, ownPaths, reserveMedia, verifyUploads } from "@/lib/storage";
import { requireUser } from "@/lib/supabase/server";
import { todayISO } from "@/lib/time";
import {
  addPhotoSchema,
  captionSchema,
  isoDate,
  photoIdSchema,
  prepareUploadSchema,
  replacePhotoSchema,
  uploadPathsOk,
} from "@/lib/validation/photos";

type Fail = { ok: false; message: string };

export type UploadTicket = { ok: true; image: UploadTarget; thumb: UploadTarget };

/** Shown when a person's photo space is full. */
const SPACE_FULL_MESSAGE = `Your photo space is full (${formatSize(MEDIA_QUOTA_BYTES)}). Delete some photos or videos to add new ones.`;

function revalidate() {
  revalidatePath("/calendar", "layout");
  revalidatePath("/memories");
  revalidatePath("/");
}

/**
 * Step 1: reserve the day's file (an image, or a video) and its thumbnail (always an image), then
 * hand out an upload link for each. reserve_media refuses other folders, big files, wrong types,
 * a full photo space and too many uploads in an hour; the links only take that exact file.
 */
export async function prepareUpload(
  date: string,
  full: { ext: MediaExt; bytes: number },
  thumb: { ext: ImageExt; bytes: number },
): Promise<UploadTicket | Fail> {
  const parsed = prepareUploadSchema.safeParse({ date, full, thumb });
  if (!parsed.success) return { ok: false, message: "Invalid upload." };
  const { supabase, user, timeZone } = await requireUser();
  if (parsed.data.date > todayISO(timeZone)) return { ok: false, message: "That day hasn't happened yet." };

  const base = `${user.id}/${parsed.data.date}-${randomBytes(8).toString("hex")}`;
  const files = [
    { path: `${base}.${parsed.data.full.ext}`, bytes: parsed.data.full.bytes, contentType: CONTENT_TYPE_OF_EXT[parsed.data.full.ext] },
    { path: `${base}-thumb.${parsed.data.thumb.ext}`, bytes: parsed.data.thumb.bytes, contentType: CONTENT_TYPE_OF_EXT[parsed.data.thumb.ext] },
  ];
  const reserved = await reserveMedia(supabase, files);
  if (!reserved.ok) {
    if (reserved.reason === "quota") return { ok: false, message: SPACE_FULL_MESSAGE };
    if (reserved.reason === "rate") return { ok: false, message: "That's a lot of uploads at once. Try again in a little while." };
    if (reserved.reason === "invalid") return { ok: false, message: "Invalid upload." };
    return { ok: false, message: "Couldn't start the upload. Try again." };
  }

  const store = mediaStore(supabase);
  try {
    const [image, thumbTarget] = await Promise.all(files.map((f) => store.uploadTarget(f.path, f.bytes, f.contentType)));
    return { ok: true, image, thumb: thumbTarget };
  } catch (error) {
    console.error("prepareUpload", error);
    await discardMedia(store, files.map((f) => f.path)).catch(() => {});
    return { ok: false, message: "Couldn't start the upload. Try again." };
  }
}

/** The signed-in user's photo space, for the upload sheet's notice. Reads only; null if unknown. */
export async function photoSpace(): Promise<{ used: number; quota: number } | null> {
  const { supabase } = await requireUser();
  try {
    return await mediaUsage(supabase);
  } catch (error) {
    console.error("photoSpace", error);
    return null;
  }
}

/**
 * One day, week or month of the person's photos, with view links, for a share picture.
 * Reads only. At most about six weeks at a time (a month in either calendar fits).
 */
export async function photosForShare(from: string, to: string): Promise<{ ok: true; photos: PhotoView[] } | Fail> {
  const a = isoDate.safeParse(from);
  const b = isoDate.safeParse(to);
  if (!a.success || !b.success || a.data > b.data) return { ok: false, message: "Invalid dates." };
  const days = (Date.parse(b.data) - Date.parse(a.data)) / 86_400_000;
  if (days > 45) return { ok: false, message: "Invalid dates." };
  const { supabase, user } = await requireUser();
  try {
    return { ok: true, photos: await signPhotos(supabase, user.id, await listPhotos(supabase, a.data, b.data)) };
  } catch (error) {
    console.error("photosForShare", error);
    return { ok: false, message: "Couldn't load your photos. Try again." };
  }
}

/** Step 2a: record a new photo (or video) for a day. A day can have any number of them. */
export async function addPhoto(input: {
  date: string;
  mediaType?: MediaType;
  imagePath: string;
  thumbPath: string;
  caption?: string | null;
  groupIds?: string[];
}): Promise<{ ok: true } | Fail> {
  const parsed = addPhotoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid photo." };
  const { date, mediaType, imagePath, thumbPath, caption, groupIds } = parsed.data;
  const { supabase, user, timeZone } = await requireUser();
  if (date > todayISO(timeZone)) return { ok: false, message: "That day hasn't happened yet." };

  if (!uploadPathsOk(user.id, date, mediaType, imagePath, thumbPath)) {
    return { ok: false, message: "Invalid upload." };
  }

  const store = mediaStore(supabase);
  if (!(await verifyUploads(store, user.id, [imagePath, thumbPath]))) {
    return { ok: false, message: "The upload didn't finish. Try again." };
  }

  const { data: saved, error } = await supabase
    .from("photos")
    .insert({ date, media_type: mediaType, image_path: imagePath, thumb_path: thumbPath, caption })
    .select("id")
    .single();
  if (error) {
    console.error("addPhoto", error);
    await discardMedia(store, [imagePath, thumbPath]);
    return { ok: false, message: "Couldn't save the photo." };
  }

  // The photo is saved either way; a group that couldn't be joined is only logged.
  if (groupIds.length > 0) {
    const { error: groupError } = await supabase.rpc("set_photo_groups", { photo: saved.id, group_ids: groupIds });
    if (groupError) console.error("addPhoto groups", groupError);
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
  const store = mediaStore(supabase);
  if (!(await verifyUploads(store, user.id, [imagePath, thumbPath]))) {
    return { ok: false, message: "The upload didn't finish. Try again." };
  }

  const { error } = await supabase
    .from("photos")
    .update({ media_type: mediaType, image_path: imagePath, thumb_path: thumbPath })
    .eq("id", id);
  if (error) {
    console.error("replacePhoto", error);
    await discardMedia(store, [imagePath, thumbPath]);
    return { ok: false, message: "Couldn't save the photo." };
  }

  await removeFiles(store, user.id, [existing.image_path, existing.thumb_path], "replacePhoto");
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

  const { supabase, user } = await requireUser();
  const photo = await getPhotoById(supabase, parsed.data);
  if (!photo) return { ok: true };

  const { error } = await supabase.from("photos").delete().eq("id", parsed.data);
  if (error) return { ok: false, message: "Couldn't delete the photo." };
  await removeFiles(mediaStore(supabase), user.id, [photo.image_path, photo.thumb_path], "deletePhoto");
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
  if (orphans.length) await removeFiles(mediaStore(supabase), user.id, orphans, "discardUpload");
}

/**
 * Removes a photo's old files once the row no longer points at them. The row change already
 * happened, so a failure here is logged (the monthly orphan report finds leftovers), not shown.
 */
async function removeFiles(store: ReturnType<typeof mediaStore>, userId: string, paths: string[], action: string) {
  try {
    await discardMedia(store, ownPaths(userId, paths, action));
  } catch (error) {
    console.error(action, "remove files", error);
  }
}
