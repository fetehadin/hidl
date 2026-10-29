"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getExam } from "@/lib/data/exam";
import { requireUser } from "@/lib/supabase/server";
import { localToUtc } from "@/lib/time";
import { actualScoreSchema, examSettingsSchema } from "@/lib/validation/exam";

export type ExamFormState = {
  status: "idle" | "error" | "saved";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Echoed back on error so React 19's post-action form reset keeps what was typed. */
  values?: Record<string, string>;
};

const echo = (formData: FormData) =>
  Object.fromEntries([...formData].filter(([k, v]) => !k.startsWith("$") && typeof v === "string")) as Record<string, string>;

export async function saveExamSettings(_prev: ExamFormState, formData: FormData): Promise<ExamFormState> {
  const parsed = examSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: echo(formData),
    };
  }

  const { supabase } = await requireUser();
  const existing = await getExam(supabase);
  const examAt = localToUtc(parsed.data.exam_local);

  // Keep a recorded score only if it still fits the new max and the exam is still in the past.
  let actual = existing?.actual_score ?? null;
  if (actual !== null && (actual > parsed.data.max_score || examAt.getTime() > Date.now())) actual = null;

  // user_id is filled by the column default (auth.uid()), never sent by the app.
  const { error } = await supabase.from("exam_settings").upsert(
    {
      exam_name: parsed.data.exam_name,
      exam_at: examAt.toISOString(),
      target_score: parsed.data.target_score,
      max_score: parsed.data.max_score,
      actual_score: actual,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("saveExamSettings", error);
    return { status: "error", message: "Couldn't save. Try again.", values: echo(formData) };
  }

  revalidatePath("/countdown");
  revalidatePath("/");
  redirect("/countdown");
}

export async function saveActualScore(_prev: ExamFormState, formData: FormData): Promise<ExamFormState> {
  const parsed = actualScoreSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors, values: echo(formData) };
  }

  const { supabase, user } = await requireUser();
  const exam = await getExam(supabase);
  if (!exam) return { status: "error", message: "Set up your exam first." };
  if (new Date(exam.exam_at).getTime() > Date.now()) {
    return { status: "error", message: "You can enter your score after the exam." };
  }
  if (parsed.data.actual_score > exam.max_score) {
    return {
      status: "error",
      fieldErrors: { actual_score: [`The max is ${exam.max_score}.`] },
      values: echo(formData),
    };
  }

  const { error } = await supabase
    .from("exam_settings")
    .update({ actual_score: parsed.data.actual_score })
    .eq("user_id", user.id);
  if (error) {
    console.error("saveActualScore", error);
    return { status: "error", message: "Couldn't save your score. Try again." };
  }

  revalidatePath("/countdown");
  revalidatePath("/");
  return { status: "saved" };
}

type TokenResult = { ok: true; token: string } | { ok: false; message: string };

/**
 * Creates a bearer token for the read-only widget feed (src/app/api/widget/countdown).
 * Only its hash is stored; the raw token is returned once and never retrievable again.
 */
export async function generateWidgetToken(): Promise<TokenResult> {
  const { supabase, user } = await requireUser();
  const exam = await getExam(supabase);
  if (!exam) return { ok: false, message: "Set up your exam first." };

  const token = randomBytes(24).toString("base64url");
  const widget_token_hash = createHash("sha256").update(token).digest("hex");

  const { error } = await supabase
    .from("exam_settings")
    .update({ widget_token_hash, widget_token_created_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (error) {
    console.error("generateWidgetToken", error);
    return { ok: false, message: "Couldn't create a token. Try again." };
  }

  revalidatePath("/countdown/settings");
  return { ok: true, token };
}

export async function revokeWidgetToken(): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("exam_settings")
    .update({ widget_token_hash: null, widget_token_created_at: null })
    .eq("user_id", user.id);
  if (error) {
    console.error("revokeWidgetToken", error);
    return { ok: false, message: "Couldn't remove the token. Try again." };
  }
  revalidatePath("/countdown/settings");
  return { ok: true };
}
