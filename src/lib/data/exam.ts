import type { SupabaseClient } from "@supabase/supabase-js";

export type ExamSettings = {
  exam_name: string;
  exam_at: string;
  target_score: number;
  max_score: number;
  actual_score: number | null;
  updated_at: string;
};

export async function getExam(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("exam_settings")
    .select("exam_name, exam_at, target_score, max_score, actual_score, updated_at")
    .maybeSingle();
  if (error) throw error;
  return data as ExamSettings | null;
}
