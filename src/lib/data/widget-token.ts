import type { SupabaseClient } from "@supabase/supabase-js";

export async function getWidgetTokenCreatedAt(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("widget_tokens").select("created_at").maybeSingle();
  if (error) throw error;
  return (data as { created_at: string } | null)?.created_at ?? null;
}
