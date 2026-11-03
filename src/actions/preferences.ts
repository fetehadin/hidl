"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { calendarPref } from "@/lib/dates";
import { TZ_COOKIE, isValidTimeZone } from "@/lib/time";
import { avatarSchema } from "@/lib/validation/avatar";
import { requireUser } from "@/lib/supabase/server";

/** Saves which calendar dates are shown in (user_metadata.calendar). */
export async function setCalendarPref(value: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const calendar = calendarPref(value);
  const { supabase } = await requireUser();
  const { error } = await supabase.auth.updateUser({ data: { calendar } });
  if (error) {
    console.error("setCalendarPref", error);
    return { ok: false, message: "Couldn't save. Try again." };
  }
  // requireUser() reads the preference from the access token's claims, so get a fresh one
  // now instead of waiting for the next automatic refresh.
  await supabase.auth.refreshSession();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Saves the device's time zone for this user: in `user_settings` (what the database's own checks
 * use, e.g. no photos for days that haven't happened yet) and in the cookie pages render with.
 * The cookie is only set once the row is saved, so the two can't drift apart.
 */
export async function setTimeZone(value: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isValidTimeZone(value)) return { ok: false, message: "Unknown time zone." };
  const { supabase, user } = await requireUser();
  // Update, else insert: the table is column-restricted, so no .upsert() (see generateWidgetToken).
  const updated = await supabase
    .from("user_settings")
    .update({ time_zone: value }, { count: "exact" })
    .eq("user_id", user.id);
  let error = updated.error;
  if (!error && updated.count === 0) {
    ({ error } = await supabase.from("user_settings").insert({ time_zone: value }));
    if (error?.code === "23505") {
      ({ error } = await supabase.from("user_settings").update({ time_zone: value }).eq("user_id", user.id));
    }
  }
  if (error) {
    console.error("setTimeZone", error);
    return { ok: false, message: "Couldn't save your time zone." };
  }
  (await cookies()).set(TZ_COOKIE, value, { path: "/", maxAge: 400 * 24 * 60 * 60, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Saves the user's buddy in `profiles` (checked by profiles_avatar_ok in Postgres). Read fresh
 * on every page, so it shows up as soon as the page refreshes: no session refresh involved.
 */
export async function setAvatar(input: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = avatarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That avatar has an option we don't know." };
  const { supabase, user } = await requireUser();
  // Update, else insert (user_id comes from auth.uid(); the app can only write `avatar`).
  const updated = await supabase
    .from("profiles")
    .update({ avatar: parsed.data }, { count: "exact" })
    .eq("user_id", user.id);
  let error = updated.error;
  if (!error && updated.count === 0) {
    ({ error } = await supabase.from("profiles").insert({ avatar: parsed.data }));
    // Another tab inserted first: then this one's an update after all.
    if (error?.code === "23505") {
      ({ error } = await supabase.from("profiles").update({ avatar: parsed.data }).eq("user_id", user.id));
    }
  }
  if (error) {
    console.error("setAvatar", error);
    return { ok: false, message: "Couldn't save. Try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Goes back to Hidi: forgets the buddy, so the app shows the mascot again. */
export async function resetAvatar(): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").delete().eq("user_id", user.id);
  if (error) {
    console.error("resetAvatar", error);
    return { ok: false, message: "Couldn't reset. Try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
