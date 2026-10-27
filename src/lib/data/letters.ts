import type { SupabaseClient } from "@supabase/supabase-js";

/** Every column except `body`, which the database refuses to return directly. */
export const LETTER_META_COLUMNS =
  "id, title, recipient, occasion, unlock_at, created_at, opened_at" as const;

export type LetterMeta = {
  id: string;
  title: string;
  recipient: string;
  occasion: string | null;
  unlock_at: string;
  created_at: string;
  opened_at: string | null;
};

export type OpenedLetter = LetterMeta & { body: string };

export class LetterSealedError extends Error {
  constructor() {
    super("This letter is still sealed.");
    this.name = "LetterSealedError";
  }
}

export async function listLetters(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("letters")
    .select(LETTER_META_COLUMNS)
    .order("unlock_at", { ascending: true });
  if (error) throw error;
  return data as LetterMeta[];
}

export async function getLetterMeta(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("letters")
    .select(LETTER_META_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as LetterMeta | null;
}

/**
 * Reads a letter's body through the database's `open_letter` function, which
 * refuses while now() < unlock_at and records opened_at on first open.
 */
export async function openLetter(supabase: SupabaseClient, id: string): Promise<OpenedLetter> {
  const { data, error } = await supabase.rpc("open_letter", { letter_id: id }).single();
  if (error) {
    if (error.hint === "sealed") throw new LetterSealedError();
    throw error;
  }
  return data as OpenedLetter;
}

/** The soonest letter still sealed, plus how many are unlocked but unread. */
export async function letterSummary(supabase: SupabaseClient) {
  const nowIso = new Date().toISOString();
  const [next, ready] = await Promise.all([
    supabase
      .from("letters")
      .select(LETTER_META_COLUMNS)
      .gt("unlock_at", nowIso)
      .order("unlock_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("letters")
      .select("id", { count: "exact", head: true })
      .lte("unlock_at", nowIso)
      .is("opened_at", null),
  ]);
  if (next.error) throw next.error;
  if (ready.error) throw ready.error;
  return { next: next.data as LetterMeta | null, readyCount: ready.count ?? 0 };
}
