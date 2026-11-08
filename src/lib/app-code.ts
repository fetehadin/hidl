import { createHash, randomInt } from "node:crypto";

/**
 * The one-time code that signs the phone app in from an open website tab. Eight characters from
 * an alphabet without look-alikes (no 0/O, 1/I/L), shown as "K7M2-Q9XP": 31^8, about 10^12 options, and
 * each code lives 10 minutes and works once (app_handoffs, ..._app_handoff.sql).
 */
export const APP_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const APP_CODE_LENGTH = 8;

export function newAppCode() {
  return Array.from({ length: APP_CODE_LENGTH }, () => APP_CODE_ALPHABET[randomInt(APP_CODE_ALPHABET.length)]).join("");
}

/** "k7m2 q9xp", "K7M2-Q9XP" → "K7M2Q9XP"; null if it can't be a code. */
export function normalizeAppCode(input: string) {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return code.length === APP_CODE_LENGTH && [...code].every((c) => APP_CODE_ALPHABET.includes(c)) ? code : null;
}

export function formatAppCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function hashAppCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}
