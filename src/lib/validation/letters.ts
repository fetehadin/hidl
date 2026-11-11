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

/** Fits the database's limit once encrypted (letters_body_check). */
export const LETTER_BODY_MAX = 30000;

export const newLetterSchema = z.object({
  title: z.string().trim().min(1, "Give it a title.").max(120),
  recipient: z.string().trim().min(1, "Who is it for?").max(60),
  occasion: optionalText(80),
  /** The letter's text; the server encrypts it before storing (src/lib/letter-crypto.ts). */
  body: z.string().trim().min(1, "Write something first.").max(LETTER_BODY_MAX, "That's too long for one letter."),
  unlock_local: localDateTime,
});

export const letterIdSchema = z.uuid();

/** Moving a sealed letter's opening date (earlier or later). */
export const changeDateSchema = z.object({
  id: letterIdSchema,
  unlock_local: localDateTime,
});

/**
 * An opened end-to-end letter's text, decrypted in the owner's browser, to be sealed on the
 * server instead. Older letters allowed 50,000 characters, which still fits once sealed.
 */
export const resealLetterSchema = z.object({
  id: letterIdSchema,
  text: z.string().min(1).max(50000),
});
