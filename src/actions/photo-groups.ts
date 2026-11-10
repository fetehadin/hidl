"use server";

import { revalidatePath } from "next/cache";
import { listPhotoGroups } from "@/lib/data/photo-groups";
import { MAX_PHOTO_GROUPS, type PhotoGroup } from "@/lib/photo-groups";
import { requireUser } from "@/lib/supabase/server";
import {
  photoGroupName,
  photoGroupOrderSchema,
  photoIdSchema,
  renamePhotoGroupSchema,
  setPhotoGroupsSchema,
} from "@/lib/validation/photos";

type Fail = { ok: false; message: string };
/** Every change answers with the person's groups as they are now, for the pickers to show. */
type Done = { ok: true; groups: PhotoGroup[] };

function revalidate() {
  revalidatePath("/memories");
  revalidatePath("/calendar", "layout");
  revalidatePath("/");
}

function failure(action: string, error: { code?: string } | null): Fail {
  if (error?.code === "23505") return { ok: false, message: "You already have a group called that." };
  if (error?.code === "53400") return { ok: false, message: `That's the most groups you can have (${MAX_PHOTO_GROUPS}).` };
  console.error(action, error);
  return { ok: false, message: "Couldn't save that. Try again." };
}

async function current(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"]): Promise<Done | Fail> {
  try {
    return { ok: true, groups: await listPhotoGroups(supabase) };
  } catch (error) {
    console.error("photoGroups", error);
    return { ok: false, message: "Couldn't load your groups." };
  }
}

/** The signed-in person's groups, for a picker opened on a page that didn't load them. Reads only. */
export async function myPhotoGroups(): Promise<Done | Fail> {
  const { supabase } = await requireUser();
  return current(supabase);
}

/** Makes a new group (it goes last in the order). */
export async function createPhotoGroup(name: string): Promise<(Done & { id: string }) | Fail> {
  const parsed = photoGroupName.safeParse(name);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid name." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("photo_groups").insert({ name: parsed.data }).select("id").single();
  if (error) return failure("createPhotoGroup", error);
  revalidate();
  const list = await current(supabase);
  return list.ok ? { ...list, id: data.id } : list;
}

export async function renamePhotoGroup(input: { id: string; name: string }): Promise<Done | Fail> {
  const parsed = renamePhotoGroupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid name." };
  const { supabase } = await requireUser();
  const { error, count } = await supabase
    .from("photo_groups")
    .update({ name: parsed.data.name }, { count: "exact" })
    .eq("id", parsed.data.id);
  if (error || count === 0) return failure("renamePhotoGroup", error);
  revalidate();
  return current(supabase);
}

/** Deletes a group. Its photos stay; they just leave the group. */
export async function deletePhotoGroup(id: string): Promise<Done | Fail> {
  const parsed = photoIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: "Invalid group." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("photo_groups").delete().eq("id", parsed.data);
  if (error) return failure("deletePhotoGroup", error);
  revalidate();
  return current(supabase);
}

/** Saves the person's priority order: `ids` first to last. */
export async function orderPhotoGroups(ids: string[]): Promise<Done | Fail> {
  const parsed = photoGroupOrderSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, message: "Invalid order." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_photo_group_order", { ids: parsed.data });
  if (error) return failure("orderPhotoGroups", error);
  revalidate();
  return current(supabase);
}

/** Puts a photo in exactly these groups (none = no group). */
export async function setPhotoGroups(input: { photoId: string; groupIds: string[] }): Promise<{ ok: true } | Fail> {
  const parsed = setPhotoGroupsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid groups." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_photo_groups", { photo: parsed.data.photoId, group_ids: parsed.data.groupIds });
  if (error) return failure("setPhotoGroups", error);
  revalidate();
  return { ok: true };
}
