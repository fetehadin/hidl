// The optional per-device app lock (PIN or pattern). Everything here runs in the browser; the
// server only ever sees a cookie saying "this device has a lock for user X" (LOCK_COOKIE), so it
// can render the page hidden until the lock screen has been passed, with no flash of content.
//
// This is a privacy screen, like a phone's app lock: it stops someone who picks up your
// unlocked phone or computer from browsing your journal. It doesn't encrypt anything (the
// letter passphrase does that), and someone with full access to the browser's storage could
// remove it. Forgetting it is fine: signing out clears it, and signing in again needs your email.

export type LockKind = "pin" | "pattern";

/** How long the app may be in the background before it locks again, in seconds. */
export const LOCK_TIMEOUTS = [
  { value: 0, label: "Every time I leave hidl" },
  { value: 60, label: "After 1 minute away" },
  { value: 300, label: "After 5 minutes away" },
  { value: 1800, label: "After 30 minutes away" },
] as const;
export type LockTimeout = (typeof LOCK_TIMEOUTS)[number]["value"];

export type LockConfig = {
  v: 1;
  kind: LockKind;
  /** PIN length, so the lock screen can check as soon as the last digit is typed. */
  length: number;
  salt: string;
  hash: string;
  iterations: number;
  timeout: LockTimeout;
  /** Wrong tries in a row, and when the next try is allowed (ms epoch) after too many. */
  failures: number;
  blockedUntil: number;
};

export const LOCK_COOKIE = "hidl-lock";
export const PIN_MIN = 4;
export const PIN_MAX = 6;
export const PATTERN_MIN = 4;
const ITERATIONS = 100_000;
/** Wrong tries allowed before the lock screen starts making you wait. */
export const FREE_TRIES = 5;

export const configKey = (userId: string) => `hidl-lock:${userId}`;
/** sessionStorage: when this tab was last unlocked/seen, so a reload doesn't lock again at once. */
export const seenKey = (userId: string) => `hidl-lock-seen:${userId}`;

export function isValidPin(pin: string) {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

/** A pattern is the dots 0–8 (row by row) in the order they were joined, each used once. */
export function isValidPattern(points: number[]) {
  return points.length >= PATTERN_MIN && new Set(points).size === points.length && points.every((p) => Number.isInteger(p) && p >= 0 && p <= 8);
}

/**
 * Adds a dot to a pattern being drawn. Like Android, joining two dots across an unused one in
 * between (0→2 passes 1, 0→8 passes 4) picks that one up too. Used dots are ignored.
 */
export function addPatternPoint(points: number[], next: number): number[] {
  if (points.includes(next) || next < 0 || next > 8) return points;
  const last = points.at(-1);
  if (last !== undefined) {
    const [r1, c1, r2, c2] = [Math.floor(last / 3), last % 3, Math.floor(next / 3), next % 3];
    if ((r1 + r2) % 2 === 0 && (c1 + c2) % 2 === 0) {
      const mid = ((r1 + r2) / 2) * 3 + (c1 + c2) / 2;
      if (!points.includes(mid)) return [...points, mid, next];
    }
  }
  return [...points, next];
}

export const patternSecret = (points: number[]) => `pattern:${points.join("-")}`;
export const pinSecret = (pin: string) => `pin:${pin}`;

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(secret: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return toB64(new Uint8Array(bits));
}

/** A new lock for `secret` (from pinSecret/patternSecret). The secret itself is never stored. */
export async function createLock(kind: LockKind, secret: string, length: number, timeout: LockTimeout, iterations = ITERATIONS): Promise<LockConfig> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { v: 1, kind, length, salt: toB64(salt), hash: await derive(secret, salt, iterations), iterations, timeout, failures: 0, blockedUntil: 0 };
}

export async function checkLock(config: LockConfig, secret: string) {
  const hash = await derive(secret, fromB64(config.salt), config.iterations);
  // Constant-time compare (both are 44-character base64 strings).
  let diff = hash.length ^ config.hash.length;
  for (let i = 0; i < Math.min(hash.length, config.hash.length); i++) diff |= hash.charCodeAt(i) ^ config.hash.charCodeAt(i);
  return diff === 0;
}

/** After FREE_TRIES wrong tries: 30 s, then doubling, at most 15 minutes. */
export function waitAfterFailures(failures: number) {
  if (failures < FREE_TRIES) return 0;
  return Math.min(30_000 * 2 ** (failures - FREE_TRIES), 15 * 60_000);
}

/** Whether coming back after being away since `seenAt` should lock (no `seenAt`: a fresh start). */
export function shouldLock(seenAt: number | null, now: number, timeout: LockTimeout) {
  if (seenAt === null) return true;
  return now - seenAt >= timeout * 1000;
}

export function parseLockConfig(raw: string | null): LockConfig | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<LockConfig>;
    if (c.v !== 1 || (c.kind !== "pin" && c.kind !== "pattern") || typeof c.hash !== "string" || typeof c.salt !== "string") return null;
    const timeout = LOCK_TIMEOUTS.some((t) => t.value === c.timeout) ? (c.timeout as LockTimeout) : 60;
    return {
      v: 1,
      kind: c.kind,
      length: Number(c.length) || 0,
      salt: c.salt,
      hash: c.hash,
      iterations: Number(c.iterations) || ITERATIONS,
      timeout,
      failures: Number(c.failures) || 0,
      blockedUntil: Number(c.blockedUntil) || 0,
    };
  } catch {
    return null;
  }
}
