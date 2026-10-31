"use server";

import { revalidatePath } from "next/cache";
import { calendarPref } from "@/lib/dates";
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
