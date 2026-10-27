"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LetterSealedError, getLetterMeta, openLetter } from "@/lib/data/letters";
import { requireUser } from "@/lib/supabase/server";
import { localToUtc } from "@/lib/time";
import { letterIdSchema, newLetterSchema, postponeSchema } from "@/lib/validation/letters";

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

  const unlockAt = localToUtc(parsed.data.unlock_local);
  if (unlockAt.getTime() < Date.now() + MIN_LEAD_MS) {
    return { status: "error", fieldErrors: { unlock_local: ["Pick a time in the future."] } };
  }

  const { supabase } = await requireUser();
  const { title, recipient, occasion, body } = parsed.data;
  const { error } = await supabase
    .from("letters")
    .insert({ title, recipient, occasion, body, unlock_at: unlockAt.toISOString() })
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

  const { supabase } = await requireUser();
  try {
    const letter = await openLetter(supabase, parsedId.data);
    revalidatePath("/letters");
    revalidatePath("/");
    return { ok: true, body: letter.body, openedAt: letter.opened_at! };
  } catch (e) {
    if (e instanceof LetterSealedError) return { ok: false, message: "Not yet — this one is still sealed." };
    console.error("openLetter", e);
    return { ok: false, message: "Couldn't open the letter. Try again." };
  }
}

export async function postponeLetter(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = postponeSchema.safeParse(Object.fromEntries(formData));
  const values = { unlock_local: String(formData.get("unlock_local") ?? "") };
  if (!parsed.success) return { status: "error", message: "Pick a valid date and time.", values };

  const { supabase } = await requireUser();
  const current = await getLetterMeta(supabase, parsed.data.id);
  if (!current) return { status: "error", message: "Letter not found." };

  const next = localToUtc(parsed.data.unlock_local);
  if (next.getTime() <= new Date(current.unlock_at).getTime()) {
    return { status: "error", message: "The new date has to be later than the current one.", values };
  }

  const { error } = await supabase
    .from("letters")
    .update({ unlock_at: next.toISOString() })
    .eq("id", parsed.data.id);
  if (error) {
    return { status: "error", message: error.message.includes("already unlocked")
      ? "This letter has already unlocked."
      : "Couldn't change the date. Try again." };
  }

  revalidatePath(`/letters/${parsed.data.id}`);
  revalidatePath("/letters");
  revalidatePath("/");
  return { status: "idle", message: "Moved." };
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
