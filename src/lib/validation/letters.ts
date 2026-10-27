import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .optional()
    .transform((s) => s ?? null);

/** `unlock_local` is a wall-clock value (YYYY-MM-DDTHH:mm) in the app timezone. */
export const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time.");

export const newLetterSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(120),
  recipient: z.string().trim().min(1, "Who is it for?").max(60),
  occasion: optionalText(80),
  body: z.string().trim().min(1, "Write something first.").max(50000),
  unlock_local: localDateTime,
});

export const letterIdSchema = z.uuid();

export const postponeSchema = z.object({
  id: letterIdSchema,
  unlock_local: localDateTime,
});
