"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { PHOTO_BUCKET, getPhotoById } from "@/lib/data/photos";
import { requireUser } from "@/lib/supabase/server";
import { todayISO } from "@/lib/time";
import {
  addPhotoSchema,
  captionSchema,
  isoDate,
  photoIdSchema,
  photoPathPattern,
  replacePhotoSchema,
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

/** Step 1: hand out one-time signed upload URLs for the day's image and thumbnail. */
export async function prepareUpload(date: string, ext: "webp" | "jpg"): Promise<UploadTicket | Fail> {
  const parsed = isoDate.safeParse(date);
  if (!parsed.success || (ext !== "webp" && ext !== "jpg")) return { ok: false, message: "Invalid date." };
  if (parsed.data > todayISO()) return { ok: false, message: "That day hasn't happened yet." };

  const { supabase, user } = await requireUser();
  const base = `${user.id}/${parsed.data}-${randomBytes(8).toString("hex")}`;
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  const [image, thumb] = await Promise.all([
    bucket.createSignedUploadUrl(`${base}.${ext}`),
    bucket.createSignedUploadUrl(`${base}-thumb.${ext}`),
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

/** Step 2a: record a new photo for a day. A day can have any number of photos. */
export async function addPhoto(input: {
  date: string;
  imagePath: string;
  thumbPath: string;
  caption?: string | null;
}): Promise<{ ok: true } | Fail> {
  const parsed = addPhotoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid photo." };
  const { date, imagePath, thumbPath, caption } = parsed.data;
  if (date > todayISO()) return { ok: false, message: "That day hasn't happened yet." };

  const { supabase, user } = await requireUser();
  const pattern = photoPathPattern(user.id, date);
  if (!pattern.test(imagePath) || !pattern.test(thumbPath) || imagePath === thumbPath) {
    return { ok: false, message: "Invalid upload." };
  }

  if (!(await checkFilesUploaded(supabase, [imagePath, thumbPath]))) {
    return { ok: false, message: "The upload didn't finish. Try again." };
  }

  const { error } = await supabase.from("photos").insert({ date, image_path: imagePath, thumb_path: thumbPath, caption });
  if (error) {
    console.error("addPhoto", error);
    await supabase.storage.from(PHOTO_BUCKET).remove([imagePath, thumbPath]);
    return { ok: false, message: "Couldn't save the photo." };
  }

  revalidate();
  return { ok: true };
}

/** Step 2b: swap a specific photo's image, keeping its date and caption. */
export async function replacePhoto(input: { id: string; imagePath: string; thumbPath: string }): Promise<{ ok: true } | Fail> {
  const parsed = replacePhotoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid photo." };
  const { id, imagePath, thumbPath } = parsed.data;

  const { supabase, user } = await requireUser();
  const existing = await getPhotoById(supabase, id);
  if (!existing) return { ok: false, message: "That photo no longer exists." };

  const pattern = photoPathPattern(user.id, existing.date);
  if (!pattern.test(imagePath) || !pattern.test(thumbPath) || imagePath === thumbPath) {
    return { ok: false, message: "Invalid upload." };
  }
  if (!(await checkFilesUploaded(supabase, [imagePath, thumbPath]))) {
    return { ok: false, message: "The upload didn't finish. Try again." };
  }

  const { error } = await supabase.from("photos").update({ image_path: imagePath, thumb_path: thumbPath }).eq("id", id);
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
