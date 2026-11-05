"use server";

import { requireUser } from "@/lib/supabase/server";

/**
 * Counts one visit for today (the admin overview's usage numbers). Fire-and-forget from <UsagePing>.
 * Deliberately no revalidatePath: it changes nothing any page of the user's shows, so it
 * must not clear the client's page cache (see "Tab switching" in CLAUDE.md).
 */
export async function recordVisit(): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("record_visit");
  if (error) console.error("recordVisit", error);
}
