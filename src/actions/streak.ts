"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";

/** Buys one streak freeze with XP (buy_streak_freeze: the price and the limit are checked there). */
export async function buyStreakFreeze(): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("buy_streak_freeze");
  if (error) {
    if (error.code === "HX001") return { ok: false, message: "Not enough XP yet. Keep going!" };
    if (error.code === "HX002") return { ok: false, message: "You're already holding the most freezes." };
    console.error("buyStreakFreeze", error);
    return { ok: false, message: "Couldn't buy it. Try again." };
  }
  revalidatePath("/");
  revalidatePath("/leaderboard");
  return { ok: true };
}
