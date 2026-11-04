import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicStats = {
  people: number;
  active_today: number;
  active_7d: number;
  active_30d: number;
  visits_30d: number;
  letters: number;
  letters_opened: number;
  photos: number;
  videos: number;
  countdowns: number;
  /** The last 30 days in the app timezone, oldest first, with zeros for quiet days. */
  daily: { day: string; people: number; visits: number }[];
};

/** Totals only (public_stats() never returns anything about one person). Works signed out. */
export async function getPublicStats(supabase: SupabaseClient): Promise<PublicStats> {
  const { data, error } = await supabase.rpc("public_stats");
  if (error) throw error;
  return data as PublicStats;
}
