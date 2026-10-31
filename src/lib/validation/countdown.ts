import { z } from "zod";
import {
  COUNTDOWN_KINDS,
  type CountdownDetails,
  type CountdownKind,
  type DetailField,
  KIND_INFO,
} from "@/lib/countdown-kinds";
import { localDateTime } from "./letters";

const score = z.coerce.number({ error: "Enter a number." }).int("Whole numbers only.").min(0, "Can't be negative.");
const title = z.string().trim().min(1, "Give it a name.").max(80);

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

function fieldSchema(f: DetailField): z.ZodType {
  let s: z.ZodType;
  if (f.type === "year") {
    s = z.coerce
      .number({ error: "Enter a year." })
      .int("Enter a year, like 2008.")
      .min(1900, "Enter a year after 1900.")
      .max(2100, "Enter a real year.");
  } else {
    s = z
      .string()
      .trim()
      .max(f.type === "note" ? 200 : 80, f.type === "note" ? "Keep it under 200 characters." : "Keep it under 80 characters.");
  }
  if (f.required) return z.string({ error: "Fill this in." }).trim().min(1, "Fill this in.").max(80, "Keep it under 80 characters.");
  return z.preprocess(blankToUndefined, s.optional());
}

/** Form field name for a detail, e.g. `detail_person`. */
export const detailField = (name: string) => `detail_${name}`;

export type CountdownInput = {
  kind: CountdownKind;
  title: string;
  target_local: string;
  target_score?: number;
  max_score?: number;
  details: CountdownDetails;
};

function kindSchema(kind: CountdownKind) {
  const shape: Record<string, z.ZodType> = { kind: z.literal(kind), title, target_local: localDateTime };
  for (const f of KIND_INFO[kind].fields) shape[detailField(f.name)] = fieldSchema(f);
  if (kind === "exam") {
    shape.target_score = score;
    shape.max_score = score.min(1, "Must be at least 1.").max(100000);
  }
  return z
    .object(shape)
    .refine((v) => kind !== "exam" || (v.target_score as number) <= (v.max_score as number), {
      path: ["target_score"],
      message: "Target can't be higher than the max score.",
    })
    .transform((v): CountdownInput => {
      const details: CountdownDetails = {};
      for (const f of KIND_INFO[kind].fields) {
        const value = v[detailField(f.name)];
        if (typeof value === "string" || typeof value === "number") details[f.name] = value;
      }
      return {
        kind,
        title: v.title as string,
        target_local: v.target_local as string,
        ...(kind === "exam" ? { target_score: v.target_score as number, max_score: v.max_score as number } : {}),
        details,
      };
    });
}

const kindSchemas = Object.fromEntries(COUNTDOWN_KINDS.map((k) => [k, kindSchema(k)])) as Record<
  CountdownKind,
  ReturnType<typeof kindSchema>
>;

const kindSchemaOf = z.enum(COUNTDOWN_KINDS, { error: "Pick a type." });

type ParseResult =
  | { success: true; data: CountdownInput }
  | { success: false; fieldErrors: Record<string, string[] | undefined> };

/** Parses a countdown form: picks the kind, then that kind's own fields and details. */
export function parseCountdown(raw: Record<string, unknown>): ParseResult {
  const kind = kindSchemaOf.safeParse(raw.kind);
  if (!kind.success) return { success: false, fieldErrors: { kind: ["Pick a type."] } };
  const parsed = kindSchemas[kind.data].safeParse(raw);
  if (!parsed.success) return { success: false, fieldErrors: z.flattenError(parsed.error).fieldErrors };
  return { success: true, data: parsed.data };
}

export const countdownIdSchema = z.uuid();

export const actualScoreSchema = z.object({
  countdown_id: countdownIdSchema,
  actual_score: score,
});
