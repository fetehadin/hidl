import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createClient as createSupabaseClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";

/**
 * Sign-in for the phone app (mobile/). The app has native sign-in screens, but every check
 * (the email allowlist, Google, verifying codes) happens here, exactly as for the website.
 * The app ends up with a session it hands to its in-app web view once (/auth/native), so the
 * person signs in once and sees the same account on every device.
 */

/** The only fields the app ever receives. */
export type AppSession = { access_token: string; refresh_token: string; expires_at: number | null };

export function toAppSession(session: Session): AppSession {
  return { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at ?? null };
}

/** A Supabase client with no cookies and no storage: for one request, as one user or as nobody. */
export function statelessClient(accessToken?: string): SupabaseClient {
  return createSupabaseClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

/** The app's per-attempt secret, sent over TLS when Google sign-in starts. 43 base64url chars = 256 bits. */
export const APP_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const APP_SECRET_COOKIE = "hidl-app-secret";
const SEALED_TTL_MS = 2 * 60_000;

/**
 * Encrypts a session for the trip back to the app through the `hidl://` redirect. Another app
 * could register the same scheme and see that redirect, but without the secret (which only the
 * hidl app and this server know) the blob is useless, and it expires in two minutes.
 */
export function sealForApp(session: AppSession, secret: string) {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = JSON.stringify({ ...session, sealed_at: Date.now() });
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function openFromApp(blob: string, secret: string): AppSession | null {
  try {
    const raw = Buffer.from(blob, "base64url");
    const key = createHash("sha256").update(secret).digest();
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const { sealed_at, ...session } = JSON.parse(plain) as AppSession & { sealed_at: number };
    if (Date.now() - sealed_at > SEALED_TTL_MS) return null;
    return session;
  } catch {
    return null;
  }
}

/** JSON error in the shape the app expects. */
export function appError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function appOk(body: Record<string, unknown>) {
  return NextResponse.json({ ok: true, ...body }, { headers: { "Cache-Control": "no-store" } });
}
