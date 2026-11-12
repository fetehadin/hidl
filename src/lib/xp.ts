/**
 * XP rules, for showing them ("How XP works") and for the freeze shop. The real rules live in
 * Postgres (xp_by_day, xp_freeze_cost, xp_freeze_max in supabase/migrations/..._xp_and_streak_freezes.sql);
 * change both together. No zod here: the browser imports this.
 */
export const XP_RULES = [
  { what: "A photo on the day it happened", xp: "10", limit: "once a day" },
  { what: "More photos that day", xp: "+2 each", limit: "3 a day" },
  { what: "Streak bonus", xp: "+ your streak", limit: "10 a day" },
  { what: "Write a letter", xp: "15", limit: "once a day" },
  { what: "Open a letter on its day", xp: "20", limit: "each letter" },
  { what: "Make a countdown", xp: "5", limit: "once a day" },
] as const;

/** A streak freeze's price, and how many someone can hold at once. */
export const FREEZE_COST = 50;
export const FREEZE_MAX = 2;

export type StreakState = {
  /** Days in a row captured on the day (or kept by a freeze), up to today or yesterday. */
  streak: number;
  /** Today has a photo, added today. */
  todayDone: boolean;
  /** Any photo at all, on time or not. */
  hasPhotos: boolean;
  /** XP earned ever, minus what freezes cost. */
  xpBalance: number;
  xpToday: number;
  /** Freezes held, waiting for a missed day. */
  freezes: number;
  freezeMax: number;
  freezeCost: number;
  /** Freezes spent just now on days missed up to yesterday. */
  usedNow: number;
  /** Days a freeze covered ("YYYY-MM-DD"), the last 400 days. */
  frozenDays: string[];
};
