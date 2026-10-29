import { z } from "zod";
import { localDateTime } from "./letters";

const score = z.coerce.number({ error: "Enter a number." }).int("Whole numbers only.").min(0, "Can't be negative.");
const title = z.string().trim().min(1, "Give it a name.").max(80);

export const countdownSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("exam"),
      title,
      target_local: localDateTime,
      target_score: score,
      max_score: score.min(1, "Must be at least 1.").max(100000),
    }),
    z.object({ kind: z.literal("deadline"), title, target_local: localDateTime }),
  ])
  .refine((v) => v.kind !== "exam" || v.target_score <= v.max_score, {
    path: ["target_score"],
    message: "Target can't be higher than the max score.",
  });

export const countdownIdSchema = z.uuid();

export const actualScoreSchema = z.object({
  countdown_id: countdownIdSchema,
  actual_score: score,
});
