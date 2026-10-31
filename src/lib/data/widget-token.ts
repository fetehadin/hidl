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
