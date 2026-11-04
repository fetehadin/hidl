import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** When the starred-countdown feed's token was created, or null if there isn't one. */
export async function getWidgetTokenCreatedAt(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("widget_tokens").select("created_at").is("countdown_id", null).maybeSingle();
  if (error) throw error;
  return (data as { created_at: string } | null)?.created_at ?? null;
}

/** Countdown id → when its own widget token was created, for countdowns that have one. */
export async function listCountdownWidgetTokens(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("widget_tokens").select("countdown_id, created_at").not("countdown_id", "is", null);
  if (error) throw error;
  return new Map((data as { countdown_id: string; created_at: string }[]).map((r) => [r.countdown_id, r.created_at]));
}

/**
 * Creates (or replaces) the bearer token for a widget feed: the starred-countdown feed when
 * `countdownId` is null, else that countdown's own. Only the hash is stored; the raw token is
 * returned once. Used by the website's Widget button and by the phone app's sign-in.
 */
export async function issueWidgetToken(
  supabase: SupabaseClient,
  userId: string,
  countdownId: string | null,
): Promise<{ ok: true; token: string } | { ok: false; error: unknown }> {
  const token = randomBytes(24).toString("base64url");
  const token_hash = createHash("sha256").update(token).digest("hex");

  // Not .upsert(): Postgres's ON CONFLICT DO UPDATE needs full-table SELECT to detect the
  // conflict, which a column-restricted table like this one (no grant on token_hash) can't
  // satisfy. Plain update-then-insert only needs the grants we actually have.
  const match = supabase.from("widget_tokens").update({ token_hash }, { count: "exact" }).eq("user_id", userId);
  const { error: updateError, count } = await (countdownId ? match.eq("countdown_id", countdownId) : match.is("countdown_id", null));
  if (updateError) return { ok: false, error: updateError };
  if (count === 0) {
    const { error } = await supabase.from("widget_tokens").insert({ token_hash, countdown_id: countdownId });
    if (error) return { ok: false, error };
  }
  return { ok: true, token };
}
