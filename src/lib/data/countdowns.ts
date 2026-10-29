import type { SupabaseClient } from "@supabase/supabase-js";

export type Countdown = {
  id: string;
  kind: "exam" | "deadline";
  title: string;
  target_at: string;
  target_score: number | null;
  max_score: number | null;
  actual_score: number | null;
  is_widget: boolean;
  updated_at: string;
};

const COLUMNS = "id, kind, title, target_at, target_score, max_score, actual_score, is_widget, updated_at";

export async function listCountdowns(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("countdowns").select(COLUMNS).order("target_at");
  if (error) throw error;
  return data as Countdown[];
}

export async function getCountdown(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("countdowns").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Countdown | null;
}

/** The one flagged for the widget, else the soonest upcoming, else the soonest overall. */
export async function getPrimaryCountdown(supabase: SupabaseClient) {
  const list = await listCountdowns(supabase);
  if (list.length === 0) return null;
  const now = Date.now();
  return list.find((c) => c.is_widget) ?? list.find((c) => new Date(c.target_at).getTime() > now) ?? list[0];
}
