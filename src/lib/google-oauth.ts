import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * "Continue with Google" through hidl's own address. Google's account chooser says "to continue to
 * <the domain Google sends you back to>": with Supabase's flow that's rwgvutoecjwypzoaexcy.supabase.co.
 * So when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set (the same "hidl web" client Supabase
 * uses), Google sends the person back to hidl.fetehadin.com instead; the server swaps the code for
 * Google's ID token and signs in with `signInWithIdToken`, which Supabase checks (signature,
 * audience = that client, nonce). Without them, the Supabase flow is used as before.
 *
 * The state, the PKCE verifier and the nonce stay in one short-lived httpOnly cookie in the browser
 * tab that started, so a callback only works in that tab.
 */

const COOKIE = "hidl-google";
const MAX_AGE = 10 * 60;

export type GoogleFlow = "web" | "app";

type Pending = { state: string; verifier: string; nonce: string; next: string; flow: GoogleFlow };

const b64url = (buf: Buffer) => buf.toString("base64url");
const sha256 = (s: string) => createHash("sha256").update(s).digest();

export function googleDirect() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

export function googleCallbackUrl(flow: GoogleFlow) {
  return `${publicEnv.NEXT_PUBLIC_SITE_URL}${flow === "web" ? "/auth/google/callback" : "/api/app/auth/google/callback"}`;
}

/** Remembers this attempt in the tab and gives the Google URL to send the person to. */
export async function startGoogle(flow: GoogleFlow, next = "/") {
  const client = googleDirect();
  if (!client) throw new Error("google direct sign-in is not configured");
  const pending: Pending = {
    state: b64url(randomBytes(24)),
    verifier: b64url(randomBytes(48)),
    nonce: b64url(randomBytes(24)),
    next,
    flow,
  };
  (await cookies()).set(COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: client.id,
    redirect_uri: googleCallbackUrl(flow),
    response_type: "code",
    scope: "openid email profile",
    state: pending.state,
    // Google puts this in the ID token; Supabase compares it with sha256(the raw nonce we give it).
    nonce: sha256(pending.nonce).toString("hex"),
    code_challenge: b64url(sha256(pending.verifier)),
    code_challenge_method: "S256",
    // Always show the account chooser, so someone with several accounts picks the right one.
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/** Whether this callback carries our state (so it's ours, not Supabase's `?code=` flow). */
export function isDirectCallback(params: URLSearchParams) {
  return params.has("state") && !params.has("error_code");
}

export type GoogleResult =
  | { ok: true; idToken: string; nonce: string; next: string }
  | { ok: false; reason: "cancelled" | "expired" | "failed" };

/** Checks the state, swaps the code for Google's ID token, and forgets the attempt. */
export async function finishGoogle(flow: GoogleFlow, params: URLSearchParams): Promise<GoogleResult> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  store.delete(COOKIE);
  const client = googleDirect();
  if (params.get("error") === "access_denied") return { ok: false, reason: "cancelled" };

  let pending: Pending | null = null;
  try {
    pending = raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    pending = null;
  }
  const state = params.get("state") ?? "";
  const code = params.get("code");
  if (!pending || pending.flow !== flow || !sameString(state, pending.state)) return { ok: false, reason: "expired" };
  if (!client || !code) return { ok: false, reason: "failed" };

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: client.id,
        client_secret: client.secret,
        redirect_uri: googleCallbackUrl(flow),
        grant_type: "authorization_code",
        code_verifier: pending.verifier,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
    if (!res.ok || !body.id_token) {
      console.error("google token exchange", res.status, body.error);
      return { ok: false, reason: "failed" };
    }
    return { ok: true, idToken: body.id_token, nonce: pending.nonce, next: pending.next };
  } catch (error) {
    console.error("google token exchange", error);
    return { ok: false, reason: "failed" };
  }
}

function sameString(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
