import type { SupabaseClient } from "@supabase/supabase-js";
import type { CountdownDetails, CountdownKind } from "@/lib/countdown-kinds";
import type { CountdownUnit } from "@/lib/countdown-units";

export type Countdown = {
  id: string;
  kind: CountdownKind;
  title: string;
  target_at: string;
  target_score: number | null;
  max_score: number | null;
  actual_score: number | null;
  details: CountdownDetails;
  /** Which units the time left is shown in (src/lib/countdown-units.ts). */
  units: CountdownUnit[];
  is_widget: boolean;
  /** When it was made: the start of its progress bar on Today. */
  created_at: string;
  updated_at: string;
};

const COLUMNS = "id, kind, title, target_at, target_score, max_score, actual_score, details, units, is_widget, created_at, updated_at";

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

/** The soonest upcoming, else the soonest overall. `list` is sorted by target_at. */
export function pickPrimaryCountdown(list: Countdown[], now = Date.now()) {
  if (list.length === 0) return null;
  return list.find((c) => new Date(c.target_at).getTime() > now) ?? list[0];
}
