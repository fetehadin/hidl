"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LetterSealedError, getLetterMeta, openLetter } from "@/lib/data/letters";
import { sealLetterBody } from "@/lib/letter-crypto";
import { requireUser } from "@/lib/supabase/server";
import { localToUtc } from "@/lib/time";
import { letterIdSchema, newLetterSchema, changeDateSchema } from "@/lib/validation/letters";

export type FormState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

const MIN_LEAD_MS = 60_000;

export async function createLetter(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newLetterSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { supabase, user, timeZone } = await requireUser();
  const unlockAt = localToUtc(parsed.data.unlock_local, timeZone);
  if (unlockAt.getTime() < Date.now() + MIN_LEAD_MS) {
    return { status: "error", fieldErrors: { unlock_local: ["Pick a time in the future."] } };
  }

  const { title, recipient, occasion, body } = parsed.data;
  let sealed: string;
  try {
    sealed = sealLetterBody(body, user.id);
  } catch (error) {
    console.error("createLetter", error);
    return { status: "error", message: "Couldn't seal the letter. Try again." };
  }
  const { error } = await supabase
    .from("letters")
    .insert({ title, recipient, occasion, body: sealed, encrypted: false, unlock_at: unlockAt.toISOString() })
    .select("id")
    .single();

  if (error) {
    console.error("createLetter", error);
    return { status: "error", message: "Couldn't seal the letter. Try again." };
  }

  revalidatePath("/letters");
  revalidatePath("/");
  redirect("/letters?sealed=1");
}

export type OpenResult =
  | { ok: true; body: string; openedAt: string }
  | { ok: false; message: string };

export async function openLetterAction(id: string): Promise<OpenResult> {
  const parsedId = letterIdSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, message: "Letter not found." };

  const { supabase, user } = await requireUser();
  try {
    const letter = await openLetter(supabase, parsedId.data, user.id);
    revalidatePath("/letters");
    revalidatePath("/");
    return { ok: true, body: letter.body, openedAt: letter.opened_at! };
  } catch (e) {
    if (e instanceof LetterSealedError) return { ok: false, message: "Not yet — this one is still sealed." };
    console.error("openLetter", e);
    return { ok: false, message: "Couldn't open the letter. Try again." };
  }
}

/** Changes a sealed letter's opening date, earlier or later (still in the future). */
export async function changeLetterDate(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = changeDateSchema.safeParse(Object.fromEntries(formData));
  const values = { unlock_local: String(formData.get("unlock_local") ?? "") };
  if (!parsed.success) return { status: "error", message: "Pick a valid date and time.", values };

  const { supabase, timeZone } = await requireUser();
  const current = await getLetterMeta(supabase, parsed.data.id);
  if (!current) return { status: "error", message: "Letter not found." };

  const next = localToUtc(parsed.data.unlock_local, timeZone);
  if (new Date(current.unlock_at).getTime() <= Date.now()) {
    return { status: "error", message: "This letter has already unlocked." };
  }
  if (next.getTime() < Date.now() + MIN_LEAD_MS) {
    return { status: "error", message: "Pick a time at least a minute from now.", values };
  }
  if (next.getTime() === new Date(current.unlock_at).getTime()) {
    return { status: "idle", message: "That's already the date.", values };
  }

  const { error } = await supabase
    .from("letters")
    .update({ unlock_at: next.toISOString() })
    .eq("id", parsed.data.id);
  if (error) {
    return { status: "error", message: error.message.includes("already unlocked")
      ? "This letter has already unlocked."
      : error.message.includes("in the future")
        ? "Pick a time that's still in the future."
        : "Couldn't change the date. Try again.", values };
  }

  revalidatePath(`/letters/${parsed.data.id}`);
  revalidatePath("/letters");
  revalidatePath("/");
  return { status: "idle", message: next.getTime() < new Date(current.unlock_at).getTime() ? "Moved earlier." : "Moved later." };
}

export async function deleteLetter(formData: FormData) {
  const parsedId = letterIdSchema.safeParse(formData.get("id"));
  if (!parsedId.success) redirect("/letters");

  const { supabase } = await requireUser();
  const { error } = await supabase.from("letters").delete().eq("id", parsedId.data);
  if (error) throw new Error("Couldn't delete the letter.");

  revalidatePath("/letters");
  revalidatePath("/");
  redirect("/letters");
}
