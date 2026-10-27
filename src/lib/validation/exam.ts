import { z } from "zod";
import { localDateTime } from "./letters";

const score = z.coerce.number({ error: "Enter a number." }).int("Whole numbers only.").min(0, "Can't be negative.");

export const examSettingsSchema = z
  .object({
    exam_name: z.string().trim().min(1, "Name your exam.").max(80),
    exam_local: localDateTime,
    target_score: score,
    max_score: score.min(1, "Must be at least 1.").max(100000),
  })
  .refine((v) => v.target_score <= v.max_score, {
    path: ["target_score"],
    message: "Target can't be higher than the max score.",
  });

export const actualScoreSchema = z.object({
  actual_score: score,
});
