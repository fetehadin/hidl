import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedbackKind, FeedbackStatus } from "@/lib/feedback";

// Typed reads for the admin panel. Every one goes through an admin_* function
// (..._admin_and_feedback.sql) that refuses non-admins with 42501.

export type AdminStats = {
  people: number;
  signups_7d: number;
  signups_30d: number;
  suspended: number;
  admins: number;
  active_today: number;
  active_7d: number;
  active_30d: number;
  visits_30d: number;
  letters: number;
  letters_opened: number;
  letters_encrypted: number;
  photos: number;
  videos: number;
  countdowns: number;
  storage_bytes: number;
  feedback_new: number;
  feedback_open: number;
  last_unlock_email_at: string | null;
  /** The last 30 days in the app timezone, oldest first, with zeros for quiet days. */
  daily: { day: string; people: number; visits: number; signups: number }[];
};

export async function getAdminStats(supabase: SupabaseClient): Promise<AdminStats> {
  const { data, error } = await supabase.rpc("admin_stats");
  if (error) throw error;
  return data as AdminStats;
}

export type AdminUserRow = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  last_active: string | null;
  letters: number;
  photos: number;
  countdowns: number;
  feedback: number;
  is_admin: boolean;
  total: number;
};

export async function listUsers(
  supabase: SupabaseClient,
  { search, limit = 50, offset = 0 }: { search?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: AdminUserRow[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_users", { p_search: search ?? null, p_limit: limit, p_offset: offset });
  if (error) throw error;
  const rows = (data ?? []) as AdminUserRow[];
  return { rows, total: rows[0]?.total ?? 0 };
}

export type AdminUserDetail = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  providers: string[];
  calendar: string | null;
  time_zone: string | null;
  is_admin: boolean;
  last_active: string | null;
  active_days_30d: number;
  visits_30d: number;
  letters: number;
  letters_sealed: number;
  letters_encrypted: number;
  photos: number;
  videos: number;
  countdowns: number;
  storage_bytes: number;
  has_letter_key: boolean;
};

export async function getUserDetail(supabase: SupabaseClient, id: string): Promise<AdminUserDetail | null> {
  const { data, error } = await supabase.rpc("admin_user_detail", { p_id: id });
  if (error) throw error;
  return (data as AdminUserDetail | null) ?? null;
}

export type AdminFeedback = {
  id: string;
  user_id: string;
  email: string | null;
  kind: FeedbackKind;
  message: string;
  page: string | null;
  user_agent: string | null;
  status: FeedbackStatus;
  reply: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
  total: number;
};

export async function listFeedback(
  supabase: SupabaseClient,
  { status, user, limit = 50, offset = 0 }: { status?: FeedbackStatus; user?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: AdminFeedback[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_feedback", {
    p_status: status ?? null,
    p_limit: limit,
    p_offset: offset,
    p_user: user ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as AdminFeedback[];
  return { rows, total: rows[0]?.total ?? 0 };
}

export type AuditEntry = {
  id: number;
  admin_email: string;
  action: string;
  target_user: string | null;
  target_email: string | null;
  /** False once the account is gone (the entry keeps its email). */
  target_exists: boolean;
  details: Record<string, unknown>;
  created_at: string;
};

export async function getAuditLog(
  supabase: SupabaseClient,
  { target, limit = 100, before }: { target?: string; limit?: number; before?: number } = {},
): Promise<AuditEntry[]> {
  const { data, error } = await supabase.rpc("admin_audit_log", { p_target: target ?? null, p_limit: limit, p_before: before ?? null });
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}
