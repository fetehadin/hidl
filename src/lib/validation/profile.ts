import { z } from "zod";
import { displayNameProblem, normalizeDisplayName } from "@/lib/profile-rules";

/** The profile form: a display name (empty = none) and whether to appear on the leaderboard. */
export const profileSchema = z.object({
  display_name: z
    .string()
    .transform(normalizeDisplayName)
    .superRefine((name, ctx) => {
      const problem = name === "" ? null : displayNameProblem(name);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    })
    .transform((name) => (name === "" ? null : name)),
  show_on_leaderboard: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});
