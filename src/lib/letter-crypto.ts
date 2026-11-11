import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Letters are encrypted on hidl's server, the way Telegram's cloud chats are: the database
 * (Supabase) only ever holds ciphertext, and the key lives only in the server's environment
 * (LETTER_SECRET_KEY, 32 random bytes in base64). Nothing to set up for the writer, and letters
 * open on any device they sign in on. The database still keeps a letter sealed until its date
 * (`open_letter`), and the app lock is asked before one is opened.
 *
 * Format: `srv1.<12-byte IV, base64>.<AES-256-GCM ciphertext + tag, base64>`, bound to its
 * owner (the user id is the additional data), so a body moved to another account won't open.
 * The database checks the shape (letters_body_check). Older letters are plain text, or
 * end-to-end encrypted in the browser (`encrypted = true`, src/lib/e2ee.ts); both still open.
 *
 * Changing the key: put the old one in LETTER_SECRET_KEY_PREVIOUS and a new one in
 * LETTER_SECRET_KEY. Letters still open with either, and scripts/rotate-letter-key.mjs re-seals
 * every body under the new key; after that the previous key can go.
 */

const PREFIX = "srv1.";
const FORMAT = /^srv1\.([A-Za-z0-9+/]{16})\.([A-Za-z0-9+/]+={0,2})$/;

function readKey(name: string) {
  const raw = process.env[name]?.trim();
  const buf = raw ? Buffer.from(raw, "base64") : null;
  if (!buf || buf.length !== 32) throw new Error(`${name} must be 32 bytes in base64`);
  return buf;
}

function key() {
  return readKey("LETTER_SECRET_KEY");
}

/** The keys a body may be sealed with: the current one, then the previous one while rotating. */
function keys(): [Buffer, Buffer?] {
  return process.env.LETTER_SECRET_KEY_PREVIOUS?.trim()
    ? [key(), readKey("LETTER_SECRET_KEY_PREVIOUS")]
    : [key()];
}

export function isServerSealed(body: string) {
  return body.startsWith(PREFIX);
}

export function sealLetterBody(text: string, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(userId));
  const out = Buffer.concat([cipher.update(text, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${PREFIX}${iv.toString("base64")}.${out.toString("base64")}`;
}

/** The letter's text: decrypted when the server sealed it, as stored otherwise. */
export function openLetterBody(body: string, userId: string) {
  const m = FORMAT.exec(body);
  if (!m) return body;
  const iv = Buffer.from(m[1], "base64");
  const data = Buffer.from(m[2], "base64");
  const [current, previous] = keys();
  try {
    return decryptWith(current, iv, data, userId);
  } catch (error) {
    if (!previous) throw error;
    return decryptWith(previous, iv, data, userId);
  }
}

function decryptWith(k: Buffer, iv: Buffer, data: Buffer, userId: string) {
  const decipher = createDecipheriv("aes-256-gcm", k, iv);
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString("utf8");
}
