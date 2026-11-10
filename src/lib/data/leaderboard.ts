import type { SupabaseClient } from "@supabase/supabase-js";
import { type AvatarConfig, parseAvatar } from "@/lib/avatar";

export type LeaderboardPeriod = "week" | "month";

export type LeaderboardRow = {
  rank: number;
  /** null: no name set, or (in released results) they've since left the board. */
  displayName: string | null;
  avatar: AvatarConfig | null;
  /** XP earned in the period: what the board ranks. */
  xp: number;
  /** The longest run of on-time photo days in the period. */
  streak: number;
  photoDays: number;
  isMe: boolean;
};

export type Leaderboard = { start: string; end: string; rows: LeaderboardRow[] };

type Raw = {
  rank: number;
  display_name: string | null;
  avatar: unknown;
  xp: number;
  streak: number;
  photo_days: number;
  is_me: boolean;
  period_start: string;
  period_end: string;
};

/**
 * The live board for this week/month, or the released results of the previous one
 * (leaderboard() in ..._profiles_leaderboard.sql; asking for a finished period releases it).
 * Top 50 plus the caller. `start`/`end` are "YYYY-MM-DD", also when nobody has a streak yet.
 */
export async function getLeaderboard(supabase: SupabaseClient, period: LeaderboardPeriod, previous = false): Promise<Leaderboard> {
  const { data, error } = await supabase.rpc("leaderboard", { p_period: period, p_previous: previous });
  if (error) throw error;
  const raw = (data ?? []) as Raw[];
  const rows = raw.map((r) => ({
    rank: r.rank,
    displayName: r.display_name,
    avatar: r.avatar ? parseAvatar(r.avatar) : null,
    xp: Number(r.xp),
    streak: r.streak,
    photoDays: r.photo_days,
    isMe: r.is_me,
  }));
  const bounds = raw[0] ? { start: raw[0].period_start, end: raw[0].period_end } : periodBounds(period, previous);
  return { ...bounds, rows };
}

/** The same period arithmetic as leaderboard_period_start() in SQL, for an empty board. */
export function periodBounds(period: LeaderboardPeriod, previous: boolean, today = addisToday()) {
  const d = new Date(`${today}T00:00:00Z`);
  let start: Date;
  let end: Date;
  if (period === "week") {
    const sinceMonday = (d.getUTCDay() + 6) % 7;
    start = new Date(d);
    start.setUTCDate(d.getUTCDate() - sinceMonday - (previous ? 7 : 0));
    end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
  } else {
    start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (previous ? 1 : 0), 1));
    end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  }
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

/** Today in Africa/Addis_Ababa: the leaderboard's clock (app_today() in SQL). */
function addisToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(new Date());
}
