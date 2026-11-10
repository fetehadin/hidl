import type { SupabaseClient } from "@supabase/supabase-js";
import type { StreakState } from "@/lib/xp";

/**
 * The signed-in user's XP and freezes (my_streak() in ..._xp_and_streak_freezes.sql). It also
 * spends freezes on days missed up to yesterday, so call it where the streak is shown.
 */
export async function getStreakState(supabase: SupabaseClient): Promise<StreakState> {
  const { data, error } = await supabase.rpc("my_streak");
  if (error) throw error;
  const d = data as {
    xp_balance: number;
    xp_today: number;
    freezes: number;
    freeze_max: number;
    freeze_cost: number;
    used_now: number;
    frozen_days: string[];
  };
  return {
    xpBalance: Number(d.xp_balance),
    xpToday: Number(d.xp_today),
    freezes: Number(d.freezes),
    freezeMax: Number(d.freeze_max),
    freezeCost: Number(d.freeze_cost),
    usedNow: Number(d.used_now),
    frozenDays: d.frozen_days ?? [],
  };
}
