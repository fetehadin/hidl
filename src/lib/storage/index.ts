import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contentMatches } from "@/lib/media-sniff";
import { createAdminClient } from "@/lib/supabase/admin";
import { storageConfig } from "./config";
import { isOwnPath } from "./paths";
import { s3Store } from "./s3";
import { supabaseStore } from "./supabase";
import type { MediaStore } from "./types";

export type { MediaStore, UploadTarget } from "./types";
export { isOwnPath } from "./paths";

let cachedS3: { key: string; store: MediaStore } | null = null;

/**
 * The photo/video store for this request. With Supabase it acts as `supabase` (the user, or the
 * service role for admin deletes); the S3 store has its own key and relies on the checks below.
 */
export function mediaStore(supabase: SupabaseClient): MediaStore {
  const config = storageConfig();
  if (config.STORAGE_PROVIDER === "supabase") return supabaseStore(supabase);
  const key = `${config.S3_PUBLIC_URL}|${config.S3_ENDPOINT}|${config.S3_BUCKET}|${config.S3_ACCESS_KEY_ID}`;
  if (cachedS3?.key !== key) cachedS3 = { key, store: s3Store(config) };
  return cachedS3.store;
}

/** The store's size limit and which provider it is, for the admin panel. */
export function mediaCapacity() {
  const config = storageConfig();
  return { provider: config.STORAGE_PROVIDER, bytes: config.MEDIA_CAPACITY_BYTES };
}

/** Logs a refused file request: who, what and why, never a link or a key. */
export function logMediaDenied(action: string, userId: string, detail: string) {
  console.warn("media-denied", JSON.stringify({ action, userId, detail }));
}


/** Keeps only the user's own paths, logging any others. */
export function ownPaths(userId: string, paths: string[], action: string) {
  const own = paths.filter((p) => isOwnPath(userId, p));
  if (own.length !== paths.length) logMediaDenied(action, userId, `${paths.length - own.length} path(s) outside their folder`);
  return own;
}

export type ReserveResult = { ok: true } | { ok: false; reason: "quota" | "rate" | "invalid" | "error" };

/** Records files before their upload links are signed (reserve_media: folder, size, type, quota, rate). */
export async function reserveMedia(
  supabase: SupabaseClient,
  files: { path: string; bytes: number; contentType: string }[],
): Promise<ReserveResult> {
  const { error } = await supabase.rpc("reserve_media", {
    p_files: files.map((f) => ({ path: f.path, bytes: f.bytes, content_type: f.contentType })),
  });
  if (!error) return { ok: true };
  if (error.code === "53100") return { ok: false, reason: "quota" };
  if (error.code === "53400") return { ok: false, reason: "rate" };
  if (error.code === "23514" || error.code === "23505" || error.code === "22023") return { ok: false, reason: "invalid" };
  console.error("reserveMedia", error);
  return { ok: false, reason: "error" };
}

/** How much photo space the signed-in user has used, and their limit. */
export async function mediaUsage(supabase: SupabaseClient): Promise<{ used: number; quota: number }> {
  const { data, error } = await supabase.rpc("media_usage");
  if (error) throw error;
  const usage = data as { used: number | string; quota: number | string };
  return { used: Number(usage.used), quota: Number(usage.quota) };
}

/**
 * Checks freshly uploaded files against what was reserved: there, the reserved size, the reserved
 * type, and first bytes that really are that type. Good files are marked confirmed; if any file
 * fails, the whole upload is removed (files and records) and this returns false.
 *
 * The record is written with the service role on purpose: users can't change it, so they can't
 * shrink their usage or claim someone else's file.
 */
export async function verifyUploads(store: MediaStore, userId: string, paths: string[]): Promise<boolean> {
  if (paths.length === 0 || ownPaths(userId, paths, "verify").length !== paths.length) return false;
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("media_objects")
    .select("path, user_id, bytes, content_type")
    .in("path", paths);
  if (error) {
    console.error("verifyUploads", error);
    return false;
  }

  const problems: string[] = [];
  for (const path of paths) {
    const row = rows?.find((r) => r.path === path);
    if (!row || row.user_id !== userId) {
      problems.push(`${path}: not reserved`);
      continue;
    }
    const stored = await store.inspect(path);
    if (!stored) problems.push(`${path}: missing`);
    else if (stored.bytes !== Number(row.bytes)) problems.push(`${path}: ${stored.bytes} bytes, reserved ${row.bytes}`);
    else if (stored.contentType.split(";")[0].trim() !== row.content_type) problems.push(`${path}: stored as ${stored.contentType}`);
    else if (!contentMatches(row.content_type, stored.head)) problems.push(`${path}: content isn't ${row.content_type}`);
  }

  if (problems.length) {
    // "missing" is usually just an upload that didn't finish; anything else is worth a look.
    if (problems.some((p) => !p.endsWith("missing"))) logMediaDenied("verify", userId, problems.join("; "));
    await discardMedia(store, paths.filter((p) => rows?.some((r) => r.path === p && r.user_id === userId)));
    return false;
  }

  const { error: confirmError } = await admin.from("media_objects").update({ confirmed_at: new Date().toISOString() }).in("path", paths);
  if (confirmError) {
    console.error("verifyUploads confirm", confirmError);
    return false;
  }
  return true;
}

/** Deletes files and their records together (records only once the files are gone). */
export async function discardMedia(store: MediaStore, paths: string[]) {
  if (paths.length === 0) return;
  await store.remove(paths);
  const { error } = await createAdminClient().from("media_objects").delete().in("path", paths);
  if (error) console.error("discardMedia", error);
}
