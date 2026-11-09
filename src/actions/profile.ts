"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { profileSchema } from "@/lib/validation/profile";

export type ProfileFormState = {
  status: "idle" | "error" | "saved";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

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
