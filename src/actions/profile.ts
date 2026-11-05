"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { AVATAR_BUCKET, isOwnPicturePath } from "@/lib/profile-rules";
import { requireUser } from "@/lib/supabase/server";
import { picturePathSchema, profileSchema } from "@/lib/validation/profile";

export type ProfileFormState = {
  status: "idle" | "error" | "saved";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

type Result = { ok: true } | { ok: false; message: string };

function revalidate() {
  revalidatePath("/", "layout");
  revalidatePath("/leaderboard");
}

/**
 * Writes some profile columns: update the row if there is one, else insert it. profiles is
 * column-restricted, so no .upsert() (see CLAUDE.md → Gotchas).
 */
async function writeProfile(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  values: Record<string, unknown>,
) {
  const updated = await supabase.from("profiles").update(values, { count: "exact" }).eq("user_id", userId);
  let error = updated.error;
  if (!error && updated.count === 0) {
    ({ error } = await supabase.from("profiles").insert(values));
    // Another tab inserted first (on the primary key): then it's an update after all.
    if (error?.code === "23505" && error.message.includes("profiles_pkey")) {
      ({ error } = await supabase.from("profiles").update(values).eq("user_id", userId));
    }
  }
  return error;
}

/** Saves the display name and leaderboard visibility. */
export async function saveProfile(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const values = {
    display_name: String(formData.get("display_name") ?? ""),
    show_on_leaderboard: formData.get("show_on_leaderboard") === "on" ? "on" : "",
  };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors, values };
  }

  const { supabase, user } = await requireUser();
  const error = await writeProfile(supabase, user.id, parsed.data);
  if (error) {
    if (error.code === "23505") {
      return { status: "error", fieldErrors: { display_name: ["Someone already has that name. Try another."] }, values };
    }
    if (error.code === "23514") {
      return { status: "error", fieldErrors: { display_name: ["That name isn't allowed. Try another."] }, values };
    }
    console.error("saveProfile", error);
    return { status: "error", message: "Couldn't save. Try again.", values };
  }
  revalidate();
  return { status: "saved" };
}

/** Step 1 of a new picture: a one-time signed upload URL in the user's avatars folder. */
export async function preparePictureUpload(ext: string): Promise<{ ok: true; path: string; token: string } | { ok: false; message: string }> {
  if (ext !== "webp" && ext !== "jpg") return { ok: false, message: "Use a JPEG or WebP picture." };
  const { supabase, user } = await requireUser();
  const path = `${user.id}/${randomBytes(8).toString("hex")}.${ext}`;
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("preparePictureUpload", error);
    return { ok: false, message: "Couldn't start the upload. Try again." };
  }
  return { ok: true, path: data.path, token: data.token };
}

/** Step 2: point the profile at the uploaded file, then remove the previous picture's file. */
export async function setProfilePicture(path: string): Promise<Result> {
  const parsed = picturePathSchema.safeParse(path);
  if (!parsed.success) return { ok: false, message: "Invalid picture." };
  const { supabase, user } = await requireUser();
  if (!isOwnPicturePath(parsed.data, user.id)) return { ok: false, message: "Invalid picture." };

  const bucket = supabase.storage.from(AVATAR_BUCKET);
  const name = parsed.data.split("/")[1];
  const { data: listed } = await bucket.list(user.id, { search: name });
  if (!listed?.some((f) => f.name === name)) return { ok: false, message: "The upload didn't finish. Try again." };

  const { data: before } = await supabase.from("profiles").select("picture_path").maybeSingle();
  const error = await writeProfile(supabase, user.id, { picture_path: parsed.data });
  if (error) {
    console.error("setProfilePicture", error);
    await bucket.remove([parsed.data]);
    return { ok: false, message: "Couldn't save your picture. Try again." };
  }
  if (before?.picture_path && before.picture_path !== parsed.data) await bucket.remove([before.picture_path]);
  revalidate();
  return { ok: true };
}

/** Back to the buddy: clears the picture and deletes its file. */
export async function removeProfilePicture(): Promise<Result> {
  const { supabase, user } = await requireUser();
  const { data: before } = await supabase.from("profiles").select("picture_path").maybeSingle();
  const { error } = await supabase.from("profiles").update({ picture_path: null }).eq("user_id", user.id);
  if (error) {
    console.error("removeProfilePicture", error);
    return { ok: false, message: "Couldn't remove it. Try again." };
  }
  if (before?.picture_path) await supabase.storage.from(AVATAR_BUCKET).remove([before.picture_path]);
  revalidate();
  return { ok: true };
}
