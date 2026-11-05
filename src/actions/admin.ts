"use server";

import { revalidatePath } from "next/cache";
import { getUserDetail } from "@/lib/data/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/server";
import { removeUserFiles } from "@/lib/user-files";
import { SUSPEND_FOR, suspendSchema, userIdSchema } from "@/lib/validation/admin";
import { feedbackUpdateSchema } from "@/lib/validation/feedback";

// Admin-panel mutations. Each one calls requireAdmin() (a 404 for non-admins) and then goes
// through a database function that checks again (assert_admin). Suspending and deleting accounts
// need the Auth admin API, so those write their audit entry first (admin_log, which refuses
// non-admins) and only then use the service-role client: the database stays the gate.

type Result = { ok: true } | { ok: false; message: string };

export type FeedbackReviewState = { status: "idle" | "error" | "saved"; message?: string };

function revalidateAdmin() {
  revalidatePath("/admin", "layout");
}

/** Sets a feedback item's status and the reply its sender sees on /feedback. */
export async function reviewFeedback(_prev: FeedbackReviewState, formData: FormData): Promise<FeedbackReviewState> {
  const reply = formData.get("reply");
  const parsed = feedbackUpdateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    reply: typeof reply === "string" ? reply : undefined,
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };

  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_update_feedback", {
    p_id: parsed.data.id,
    p_status: parsed.data.status,
    p_reply: parsed.data.reply ?? null,
  });
  if (error) {
    console.error("reviewFeedback", error);
    return { status: "error", message: "Couldn't save. Try again." };
  }
  revalidateAdmin();
  revalidatePath("/feedback");
  return { status: "saved" };
}

/** Quick status change from the inbox (no reply change). */
export async function setFeedbackStatus(id: string, status: string): Promise<Result> {
  const parsed = feedbackUpdateSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false, message: "Invalid feedback." };
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_update_feedback", { p_id: parsed.data.id, p_status: parsed.data.status, p_reply: null });
  if (error) {
    console.error("setFeedbackStatus", error);
    return { ok: false, message: "Couldn't update. Try again." };
  }
  revalidateAdmin();
  revalidatePath("/feedback");
  return { ok: true };
}

/** Loads the target and refuses the things no admin may do to an account from the panel. */
async function guardTarget(userId: string, verb: string) {
  const ctx = await requireAdmin();
  if (userId === ctx.user.id) return { ...ctx, target: null, message: `You can't ${verb} your own account here.` } as const;
  const target = await getUserDetail(ctx.supabase, userId);
  if (!target) return { ...ctx, target: null, message: "That account doesn't exist anymore." } as const;
  if (target.is_admin) return { ...ctx, target: null, message: `Remove their admin access before you ${verb} them.` } as const;
  return { ...ctx, target, message: null } as const;
}

/**
 * Suspends an account (a Supabase Auth ban): they can't sign in or refresh their session.
 * A page they already have open keeps working until its access token expires (up to an hour).
 */
export async function suspendUser(userId: string, duration: string): Promise<Result> {
  const parsed = suspendSchema.safeParse({ userId, duration });
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { supabase, target, message } = await guardTarget(parsed.data.userId, "suspend");
  if (!target) return { ok: false, message };

  const log = await supabase.rpc("admin_log", { p_action: "user.suspend", p_target: target.id, p_details: { duration: parsed.data.duration } });
  if (log.error) {
    console.error("suspendUser", log.error);
    return { ok: false, message: "Couldn't suspend. Try again." };
  }
  const { error } = await createAdminClient().auth.admin.updateUserById(target.id, { ban_duration: SUSPEND_FOR[parsed.data.duration] });
  if (error) {
    console.error("suspendUser", error);
    await supabase.rpc("admin_log", { p_action: "user.suspend_failed", p_target: target.id, p_details: { error: error.message } });
    return { ok: false, message: "Couldn't suspend. Try again." };
  }
  revalidateAdmin();
  return { ok: true };
}

export async function unsuspendUser(userId: string): Promise<Result> {
  const parsed = userIdSchema.safeParse(userId);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { supabase, target, message } = await guardTarget(parsed.data, "unsuspend");
  if (!target) return { ok: false, message };

  const log = await supabase.rpc("admin_log", { p_action: "user.unsuspend", p_target: target.id });
  if (log.error) {
    console.error("unsuspendUser", log.error);
    return { ok: false, message: "Couldn't lift the suspension. Try again." };
  }
  const { error } = await createAdminClient().auth.admin.updateUserById(target.id, { ban_duration: "none" });
  if (error) {
    console.error("unsuspendUser", error);
    return { ok: false, message: "Couldn't lift the suspension. Try again." };
  }
  revalidateAdmin();
  return { ok: true };
}

/**
 * Deletes an account and everything in it, like deleteAccount() does for yourself: photo files
 * first, then the auth.users row (which cascades to every table). `confirmEmail` must match.
 */
export async function deleteUser(userId: string, confirmEmail: string): Promise<Result> {
  const parsed = userIdSchema.safeParse(userId);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { supabase, target, message } = await guardTarget(parsed.data, "delete");
  if (!target) return { ok: false, message };
  if (confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
    return { ok: false, message: "Type their email exactly to confirm." };
  }

  // Logged before the delete: afterwards their email can't be looked up for the entry.
  const log = await supabase.rpc("admin_log", {
    p_action: "user.delete",
    p_target: target.id,
    p_details: { letters: target.letters, photos: target.photos + target.videos, countdowns: target.countdowns },
  });
  if (log.error) {
    console.error("deleteUser", log.error);
    return { ok: false, message: "Couldn't delete. Try again." };
  }

  const admin = createAdminClient();
  try {
    await removeUserFiles(admin, target.id);
  } catch (error) {
    console.error("deleteUser files", error);
    await supabase.rpc("admin_log", { p_action: "user.delete_failed", p_target: target.id, p_details: { step: "files" } });
    return { ok: false, message: "Couldn't remove their photos, so nothing was deleted. Try again." };
  }
  const { error } = await admin.auth.admin.deleteUser(target.id);
  if (error) {
    console.error("deleteUser", error);
    await supabase.rpc("admin_log", { p_action: "user.delete_failed", p_target: target.id, p_details: { step: "account" } });
    return { ok: false, message: "Their photos were removed but the account wasn't. Try again." };
  }
  revalidateAdmin();
  return { ok: true };
}

export async function setUserAdmin(userId: string, makeAdmin: boolean): Promise<Result> {
  const parsed = userIdSchema.safeParse(userId);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_set_admin", { p_user: parsed.data, p_admin: makeAdmin === true });
  if (error) {
    if (error.code === "22023") return { ok: false, message: "You can't remove your own admin access." };
    console.error("setUserAdmin", error);
    return { ok: false, message: "Couldn't update. Try again." };
  }
  revalidateAdmin();
  return { ok: true };
}
