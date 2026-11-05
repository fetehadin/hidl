import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedbackKind, FeedbackStatus } from "@/lib/feedback";

export type MyFeedback = {
  id: string;
  kind: FeedbackKind;
  message: string;
  page: string | null;
  status: FeedbackStatus;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
};

/** The signed-in user's own feedback, newest first (RLS: only their rows). */
export async function getMyFeedback(supabase: SupabaseClient, limit = 20): Promise<MyFeedback[]> {
  const { data, error } = await supabase
    .from("feedback")
    .select("id, kind, message, page, status, reply, replied_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as MyFeedback[];
}
