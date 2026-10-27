"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { PHOTO_BUCKET, getPhoto } from "@/lib/data/photos";
import { requireUser } from "@/lib/supabase/server";
import { todayISO } from "@/lib/time";
import { captionSchema, isoDate, photoPathPattern, savePhotoSchema } from "@/lib/validation/photos";

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

/** Step 2: after the files are uploaded, record (or replace) the day's photo. */
export async function savePhoto(input: {
  date: string;
  imagePath: string;
  thumbPath: string;
  caption?: string | null;
}): Promise<{ ok: true } | Fail> {
  const parsed = savePhotoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid photo." };
  const { date, imagePath, thumbPath, caption } = parsed.data;
  if (date > todayISO()) return { ok: false, message: "That day hasn't happened yet." };

  const { supabase, user } = await requireUser();
  const pattern = photoPathPattern(user.id, date);
  if (!pattern.test(imagePath) || !pattern.test(thumbPath) || imagePath === thumbPath) {
    return { ok: false, message: "Invalid upload." };
  }

  // Both files must really exist in the user's folder.
  const check = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls([imagePath, thumbPath], 60);
  if (check.error || check.data.some((d) => d.error)) {
    return { ok: false, message: "The upload didn't finish. Try again." };
  }

  const previous = await getPhoto(supabase, date);
  const write = previous
    ? await supabase
        .from("photos")
        .update({ image_path: imagePath, thumb_path: thumbPath, caption })
        .eq("date", date)
    : await supabase.from("photos").insert({ date, image_path: imagePath, thumb_path: thumbPath, caption });

  if (write.error) {
    console.error("savePhoto", write.error);
    // Don't leave orphaned files behind.
    await supabase.storage.from(PHOTO_BUCKET).remove([imagePath, thumbPath]);
    return {
      ok: false,
      message: write.error.code === "23505" ? "This day already has a photo. Refresh and try again." : "Couldn't save the photo.",
    };
  }

  if (previous) {
    await supabase.storage.from(PHOTO_BUCKET).remove([previous.image_path, previous.thumb_path]);
  }
  revalidate();
  return { ok: true };
}

export async function updateCaption(input: { date: string; caption?: string | null }): Promise<{ ok: true } | Fail> {
  const parsed = captionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid caption." };

  const { supabase } = await requireUser();
  const { error, count } = await supabase
    .from("photos")
    .update({ caption: parsed.data.caption }, { count: "exact" })
    .eq("date", parsed.data.date);
  if (error || count === 0) return { ok: false, message: "Couldn't save the caption." };
  revalidate();
  return { ok: true };
}

export async function deletePhoto(date: string): Promise<{ ok: true } | Fail> {
  const parsed = isoDate.safeParse(date);
  if (!parsed.success) return { ok: false, message: "Invalid date." };

  const { supabase } = await requireUser();
  const photo = await getPhoto(supabase, parsed.data);
  if (!photo) return { ok: true };

  const { error } = await supabase.from("photos").delete().eq("date", parsed.data);
  if (error) return { ok: false, message: "Couldn't delete the photo." };
  await supabase.storage.from(PHOTO_BUCKET).remove([photo.image_path, photo.thumb_path]);
  revalidate();
  return { ok: true };
}
