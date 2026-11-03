/**
 * End-to-end encryption for letter text. Runs in the browser (and in Node for tests) with
 * WebCrypto only. The server stores what this produces but can't read it.
 *
 *   letter key      random AES-256-GCM key, one per user, encrypts every letter body.
 *   passphrase key  PBKDF2-SHA256(passphrase, salt, 600k) → AES-256-GCM, wraps the letter key.
 *   recovery key    32 random bytes shown once as 64 hex characters (in groups); wraps the
 *                   letter key a second time so a forgotten passphrase isn't the end.
 *
 * Formats (all base64): wrapped key "<iv>.<wrapped>", letter body "e2e1.<iv>.<ciphertext>".
 * supabase/migrations/..._letter_encryption.sql checks these shapes.
 */

const subtle = () => globalThis.crypto.subtle;

export const KDF_ITERATIONS = 600_000;
export const MIN_PASSPHRASE = 10;
const BODY_PREFIX = "e2e1.";
/** Ties ciphertext to its purpose, so a letter body can't be passed off as anything else. */
const BODY_AAD = new TextEncoder().encode("hidl:letter-body:v1");

export type KeyBundle = {
  kdf_salt: string;
  kdf_iterations: number;
  passphrase_wrapped_key: string;
  recovery_wrapped_key: string;
};

// ---- encoding

function toB64(bytes: ArrayBuffer | Uint8Array) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string) {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** 64 hex characters shown as 16 groups of 4: easy to copy down, nothing ambiguous. */
function formatRecoveryKey(bytes: Uint8Array) {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return hex.match(/.{4}/g)!.join("-");
}
export function parseRecoveryKey(input: string): Uint8Array | null {
  const hex = input.replace(/[^0-9a-f]/gi, "");
  if (hex.length !== 64) return null;
  return Uint8Array.from(hex.match(/.{2}/g)!, (h) => parseInt(h, 16));
}

// ---- wrapping keys

async function passphraseKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const base = await subtle().importKey("raw", new TextEncoder().encode(passphrase.normalize("NFKC")), "PBKDF2", false, [
    "deriveKey",
  ]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}
function recoveryKey(bytes: Uint8Array) {
  return subtle().importKey("raw", bytes as BufferSource, { name: "AES-GCM" }, false, ["wrapKey", "unwrapKey"]);
}

async function wrap(letterKey: CryptoKey, wrappingKey: CryptoKey) {
  const iv = random(12);
  const wrapped = await subtle().wrapKey("raw", letterKey, wrappingKey, { name: "AES-GCM", iv });
  return `${toB64(iv)}.${toB64(wrapped)}`;
}

/** Throws if the wrapping key is wrong (AES-GCM authenticates, so a bad passphrase can't "half work"). */
async function unwrap(wrappedText: string, wrappingKey: CryptoKey, extractable: boolean) {
  const [iv, wrapped] = wrappedText.split(".");
  return subtle().unwrapKey(
    "raw",
    fromB64(wrapped) as BufferSource,
    wrappingKey,
    { name: "AES-GCM", iv: fromB64(iv) as BufferSource },
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}

export class WrongSecretError extends Error {
  constructor(what: "passphrase" | "recovery key") {
    super(what === "passphrase" ? "That passphrase doesn't unlock your letters." : "That recovery key doesn't match.");
    this.name = "WrongSecretError";
  }
}

// ---- setup, unlock, change passphrase

/** First-time setup: a new letter key, wrapped by the passphrase and by a new recovery key. */
export async function createKeyBundle(passphrase: string, iterations = KDF_ITERATIONS) {
  const letterKey = await subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const salt = random(16);
  const recovery = random(32);
  const bundle: KeyBundle = {
    kdf_salt: toB64(salt),
    kdf_iterations: iterations,
    passphrase_wrapped_key: await wrap(letterKey, await passphraseKey(passphrase, salt, iterations)),
    recovery_wrapped_key: await wrap(letterKey, await recoveryKey(recovery)),
  };
  // Hand back a non-extractable copy for use: the raw key never needs to leave WebCrypto again.
  const usable = await unwrap(bundle.recovery_wrapped_key, await recoveryKey(recovery), false);
  return { bundle, recoveryKey: formatRecoveryKey(recovery), letterKey: usable };
}

export async function unlockWithPassphrase(bundle: KeyBundle, passphrase: string, extractable = false) {
  const key = await passphraseKey(passphrase, fromB64(bundle.kdf_salt), bundle.kdf_iterations);
  try {
    return await unwrap(bundle.passphrase_wrapped_key, key, extractable);
  } catch {
    throw new WrongSecretError("passphrase");
  }
}

export async function unlockWithRecoveryKey(bundle: KeyBundle, recoveryText: string, extractable = false) {
  const bytes = parseRecoveryKey(recoveryText);
  if (!bytes) throw new WrongSecretError("recovery key");
  try {
    return await unwrap(bundle.recovery_wrapped_key, await recoveryKey(bytes), extractable);
  } catch {
    throw new WrongSecretError("recovery key");
  }
}

/**
 * New passphrase, same letter key (so every existing letter still opens). Needs the current
 * passphrase or the recovery key to get at the letter key first. The recovery copy is untouched.
 */
export async function rewrapWithNewPassphrase(
  bundle: KeyBundle,
  current: { passphrase: string } | { recoveryKey: string },
  newPassphrase: string,
  iterations = KDF_ITERATIONS,
) {
  const letterKey =
    "passphrase" in current
      ? await unlockWithPassphrase(bundle, current.passphrase, true)
      : await unlockWithRecoveryKey(bundle, current.recoveryKey, true);
  const salt = random(16);
  return {
    kdf_salt: toB64(salt),
    kdf_iterations: iterations,
    passphrase_wrapped_key: await wrap(letterKey, await passphraseKey(newPassphrase, salt, iterations)),
  };
}

// ---- letter bodies

export function isEncryptedBody(body: string) {
  return body.startsWith(BODY_PREFIX);
}

export async function encryptBody(letterKey: CryptoKey, text: string) {
  const iv = random(12);
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: BODY_AAD },
    letterKey,
    new TextEncoder().encode(text),
  );
  return `${BODY_PREFIX}${toB64(iv)}.${toB64(ct)}`;
}

export async function decryptBody(letterKey: CryptoKey, body: string) {
  if (!isEncryptedBody(body)) throw new Error("Not an encrypted letter.");
  const [iv, ct] = body.slice(BODY_PREFIX.length).split(".");
  const plain = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(iv) as BufferSource, additionalData: BODY_AAD },
    letterKey,
    fromB64(ct) as BufferSource,
  );
  return new TextDecoder().decode(plain);
}
