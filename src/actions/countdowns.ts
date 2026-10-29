"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCountdown } from "@/lib/data/countdowns";
import { requireUser } from "@/lib/supabase/server";
import { localToUtc } from "@/lib/time";
import { actualScoreSchema, countdownIdSchema, countdownSchema } from "@/lib/validation/countdown";

export type CountdownFormState = {
  status: "idle" | "error" | "saved";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Echoed back on error so React 19's post-action form reset keeps what was typed. */
  values?: Record<string, string>;
};

type Fail = { ok: false; message: string };

const echo = (formData: FormData) =>
  Object.fromEntries([...formData].filter(([k, v]) => !k.startsWith("$") && typeof v === "string")) as Record<string, string>;

function revalidate() {
  revalidatePath("/countdown");
  revalidatePath("/countdown/settings");
  revalidatePath("/");
}

export async function saveCountdown(_prev: CountdownFormState, formData: FormData): Promise<CountdownFormState> {
  const raw = Object.fromEntries(formData);
  const parsed = countdownSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
      values: echo(formData),
    };
  }

  const { supabase } = await requireUser();
  const target_at = localToUtc(parsed.data.target_local).toISOString();
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;

  if (id) {
    const update: Record<string, unknown> = { title: parsed.data.title, target_at };
    if (parsed.data.kind === "exam") {
      update.target_score = parsed.data.target_score;
      update.max_score = parsed.data.max_score;
      // Keep a recorded score only if it still fits the new max and the deadline is still in the past.
      const existing = await getCountdown(supabase, id);
      let actual = existing?.actual_score ?? null;
      if (actual !== null && (actual > parsed.data.max_score || new Date(target_at).getTime() > Date.now())) actual = null;
      update.actual_score = actual;
    }
    const { error } = await supabase.from("countdowns").update(update).eq("id", id);
    if (error) {
      console.error("saveCountdown", error);
      return { status: "error", message: "Couldn't save. Try again.", values: echo(formData) };
    }
  } else {
    const insert: Record<string, unknown> =
      parsed.data.kind === "exam"
        ? {
            kind: "exam",
            title: parsed.data.title,
            target_at,
            target_score: parsed.data.target_score,
            max_score: parsed.data.max_score,
          }
        : { kind: "deadline", title: parsed.data.title, target_at };
    const { error } = await supabase.from("countdowns").insert(insert);
    if (error) {
      console.error("saveCountdown", error);
      return { status: "error", message: "Couldn't save. Try again.", values: echo(formData) };
    }
  }

  revalidate();
  redirect("/countdown");
}

export async function saveActualScore(_prev: CountdownFormState, formData: FormData): Promise<CountdownFormState> {
  const parsed = actualScoreSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors, values: echo(formData) };
  }

  const { supabase } = await requireUser();
  const countdown = await getCountdown(supabase, parsed.data.countdown_id);
  if (!countdown || countdown.kind !== "exam" || countdown.max_score === null) {
    return { status: "error", message: "That countdown doesn't take a score." };
  }
  if (new Date(countdown.target_at).getTime() > Date.now()) {
    return { status: "error", message: "You can enter your score after the deadline." };
  }
  if (parsed.data.actual_score > countdown.max_score) {
    return {
      status: "error",
      fieldErrors: { actual_score: [`The max is ${countdown.max_score}.`] },
      values: echo(formData),
    };
  }

  const { error } = await supabase
    .from("countdowns")
    .update({ actual_score: parsed.data.actual_score })
    .eq("id", parsed.data.countdown_id);
  if (error) {
    console.error("saveActualScore", error);
    return { status: "error", message: "Couldn't save your score. Try again." };
  }

  revalidate();
  return { status: "saved" };
}

export async function deleteCountdown(id: string): Promise<{ ok: true } | Fail> {
  const parsed = countdownIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: "Invalid countdown." };

  const { supabase } = await requireUser();
  const { error } = await supabase.from("countdowns").delete().eq("id", parsed.data);
  if (error) return { ok: false, message: "Couldn't delete. Try again." };
  revalidate();
  return { ok: true };
}

/** Flags one countdown as the widget feed's, atomically clearing any previous choice. */
export async function setWidgetCountdown(id: string): Promise<{ ok: true } | Fail> {
  const parsed = countdownIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: "Invalid countdown." };

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_widget_countdown", { countdown_id: parsed.data });
  if (error) {
    console.error("setWidgetCountdown", error);
    return { ok: false, message: "Couldn't update. Try again." };
  }
  revalidate();
  return { ok: true };
}

type TokenResult = { ok: true; token: string } | Fail;

/**
 * Creates (or replaces) the bearer token for the read-only widget feed
 * (src/app/api/widget/countdown). Only its hash is stored; the raw token is
 * returned once and never retrievable again.
 */
export async function generateWidgetToken(): Promise<TokenResult> {
  const { supabase, user } = await requireUser();
  const token = randomBytes(24).toString("base64url");
  const token_hash = createHash("sha256").update(token).digest("hex");

  // Not .upsert(): Postgres's ON CONFLICT DO UPDATE needs full-table SELECT to detect the
  // conflict, which a column-restricted table like this one (no grant on token_hash) can't
  // satisfy. Plain update-then-insert only needs the grants we actually have.
  const { error: updateError, count } = await supabase
    .from("widget_tokens")
    .update({ token_hash }, { count: "exact" })
    .eq("user_id", user.id);
  if (updateError) {
    console.error("generateWidgetToken", updateError);
    return { ok: false, message: "Couldn't create a token. Try again." };
  }
  if (count === 0) {
    const { error: insertError } = await supabase.from("widget_tokens").insert({ token_hash });
    if (insertError) {
      console.error("generateWidgetToken", insertError);
      return { ok: false, message: "Couldn't create a token. Try again." };
    }
  }

  revalidatePath("/countdown/settings");
  return { ok: true, token };
}

export async function revokeWidgetToken(): Promise<{ ok: true } | Fail> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("widget_tokens").delete().eq("user_id", user.id);
  if (error) {
    console.error("revokeWidgetToken", error);
    return { ok: false, message: "Couldn't remove the token. Try again." };
  }
  revalidatePath("/countdown/settings");
  return { ok: true };
}
