import { z } from "zod";
import { FEEDBACK_KINDS, FEEDBACK_MESSAGE_MAX, FEEDBACK_STATUSES } from "@/lib/feedback";

/** A same-site path like "/calendar" (where the person was when they wrote), or nothing. */
const page = z.preprocess(
  (v) => (typeof v === "string" && /^\/[^\s]{0,199}$/.test(v) && !v.startsWith("//") ? v : undefined),
  z.string().optional(),
);

export const feedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS, { error: "Pick what kind of feedback this is." }),
  message: z
    .string({ error: "Write a few words." })
    .trim()
    .min(3, "Write a few words.")
    .max(FEEDBACK_MESSAGE_MAX, `Keep it under ${FEEDBACK_MESSAGE_MAX} characters.`),
  page,
});

export const feedbackUpdateSchema = z.object({
  id: z.uuid(),
  status: z.enum(FEEDBACK_STATUSES),
  /** Absent = leave the reply alone; empty = remove it. */
  reply: z.string().trim().max(FEEDBACK_MESSAGE_MAX, `Keep it under ${FEEDBACK_MESSAGE_MAX} characters.`).optional(),
});
