"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { FEEDBACK_PER_DAY } from "@/lib/feedback";
import { requireUser } from "@/lib/supabase/server";
import { feedbackSchema } from "@/lib/validation/feedback";

export type FeedbackFormState = {
  status: "idle" | "error" | "sent";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Echoed back on error so React 19's post-action form reset keeps what was typed. */
  values?: Record<string, string>;
};

/** Sends feedback to the admins (public.feedback). Status and reply are set by the database. */
export async function sendFeedback(_prev: FeedbackFormState, formData: FormData): Promise<FeedbackFormState> {
  const values = {
    kind: String(formData.get("kind") ?? ""),
    message: String(formData.get("message") ?? ""),
    page: String(formData.get("page") ?? ""),
  };
  const parsed = feedbackSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors, values };
  }

  const { supabase } = await requireUser();
  // The browser, so a bug report says where it happened. Trimmed to the column's limit.
  const userAgent = (await headers()).get("user-agent")?.slice(0, 400) ?? null;
  const { error } = await supabase
    .from("feedback")
    .insert({ kind: parsed.data.kind, message: parsed.data.message, page: parsed.data.page ?? null, user_agent: userAgent });
  if (error) {
    if (error.code === "53400") {
      return { status: "error", message: `That's ${FEEDBACK_PER_DAY} today, the daily limit. Thank you! Try again tomorrow.`, values };
    }
    console.error("sendFeedback", error);
    return { status: "error", message: "Couldn't send it. Try again.", values };
  }

  revalidatePath("/feedback");
  revalidatePath("/admin", "layout");
  return { status: "sent" };
}
