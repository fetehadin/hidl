/**
 * End-to-end encryption for letter text. Runs in the browser (and in Node for tests) with
 * WebCrypto only. The server stores what this produces but can't read it.
 *
 *   letter key      random AES-256-GCM key, one per user: unlocking letters means getting it.
 *   letter pair     an ECDH P-256 key pair. The public half is stored as is, so writing a
 *                   letter needs nothing unlocked; the private half is stored encrypted with the
 *                   letter key, so reading needs the letter key.
 *   ways in         the letter key is stored wrapped once per way to unlock it:
 *     passphrase    PBKDF2-SHA256(passphrase, salt, 600k) → AES-256-GCM (optional).
 *     email key     HKDF(email half ‖ server half): 32 random bytes emailed to the person (never
 *                   stored by hidl) plus 32 stored in letter_keys. Neither half opens anything
 *                   alone; together they're "the key in your email".
 *     passkey       HKDF(the passkey's PRF output): fingerprint / Face ID (src/lib/passkey.ts).
 *     recovery key  32 random bytes shown once, from before the email key existed.
 *
 * Bodies: "e2e1.<iv>.<ct>" (the letter key itself, older letters) or
 * "e2e2.<ephemeral public key>.<iv>.<ct>" (ECDH with the letter pair; new letters).
 * Wrapped keys are "<iv>.<wrapped>", all base64. The migrations check these shapes.
 */

const subtle = () => globalThis.crypto.subtle;

export const KDF_ITERATIONS = 600_000;
export const MIN_PASSPHRASE = 10;
const BODY_PREFIX = "e2e1.";
const BODY2_PREFIX = "e2e2.";
/** Ties ciphertext to its purpose, so a letter body can't be passed off as anything else. */
const BODY_AAD = new TextEncoder().encode("hidl:letter-body:v1");
const BODY2_AAD = new TextEncoder().encode("hidl:letter-body:v2");
const PRIVATE_AAD = new TextEncoder().encode("hidl:letter-private-key:v1");

/** letter_keys as the browser sees it. Every way in is optional; at least one is always set. */
export type KeyBundle = {
  kdf_salt: string | null;
  kdf_iterations: number | null;
  passphrase_wrapped_key: string | null;
  recovery_wrapped_key: string | null;
  public_key: string | null;
  private_key_wrapped: string | null;
  email_wrapped_key: string | null;
  email_share: string | null;
};

/** The parts of a key bundle the original (passphrase) setup made. */
type PassphraseParts = Pick<KeyBundle, "kdf_salt" | "kdf_iterations" | "passphrase_wrapped_key" | "recovery_wrapped_key">;

// ---- encoding

function toB64(bytes: ArrayBuffer | Uint8Array) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(s: string) {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
/** URL-safe base64 without padding, for the email link. */
export function toB64Url(bytes: Uint8Array) {
  return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64Url(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return fromB64(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
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

/** The email key from a link (#k=, URL-safe base64) or typed in (hex groups, like the recovery key). */
export function parseEmailKey(input: string): Uint8Array | null {
  const t = input.trim();
  if (/^[A-Za-z0-9_-]{43}$/.test(t)) return fromB64Url(t);
  return parseRecoveryKey(t);
}
export const formatEmailKey = formatRecoveryKey;

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
  constructor(what: "passphrase" | "recovery key" | "email key" | "passkey") {
    super(
      {
        passphrase: "That passphrase doesn't unlock your letters.",
        "recovery key": "That recovery key doesn't match.",
        "email key": "That key doesn't match. Use the newest \"Your Hidl letter key\" email.",
        passkey: "That passkey isn't one your letters know.",
      }[what],
    );
    this.name = "WrongSecretError";
  }
}

/** A copy of the letter key the page can use but never read out (what the device keeps). */
export async function nonExtractable(letterKey: CryptoKey) {
  const raw = await subtle().exportKey("raw", letterKey);
  return subtle().importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function hkdfKey(material: Uint8Array, info: string) {
  const base = await subtle().importKey("raw", material as BufferSource, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(info) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey", "encrypt", "decrypt"],
  );
}

// ---- the letter pair (writing without unlocking)

/** A new key pair: the public half as base64, the private half encrypted with the letter key. */
export async function createLetterPair(letterKey: CryptoKey) {
  const pair = (await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const pkcs8 = await subtle().exportKey("pkcs8", pair.privateKey);
  const iv = random(12);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: PRIVATE_AAD }, letterKey, pkcs8);
  return {
    public_key: toB64(await subtle().exportKey("raw", pair.publicKey)),
    private_key_wrapped: `${toB64(iv)}.${toB64(ct)}`,
  };
}

async function openPrivateKey(letterKey: CryptoKey, wrapped: string) {
  const [iv, ct] = wrapped.split(".");
  const pkcs8 = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(iv) as BufferSource, additionalData: PRIVATE_AAD },
    letterKey,
    fromB64(ct) as BufferSource,
  );
  return subtle().importKey("pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

async function bodyKey(shared: ArrayBuffer, ephemeral: Uint8Array) {
  const base = await subtle().importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: ephemeral as BufferSource, info: BODY2_AAD },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts a letter to the person's public key: no passphrase, nothing unlocked. */
export async function encryptForPublicKey(publicKeyB64: string, text: string) {
  const recipient = await subtle().importKey("raw", fromB64(publicKeyB64) as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const eph = (await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const ephRaw = new Uint8Array(await subtle().exportKey("raw", eph.publicKey));
  const shared = await subtle().deriveBits({ name: "ECDH", public: recipient }, eph.privateKey, 256);
  const iv = random(12);
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: BODY2_AAD },
    await bodyKey(shared, ephRaw),
    new TextEncoder().encode(text),
  );
  return `${BODY2_PREFIX}${toB64(ephRaw)}.${toB64(iv)}.${toB64(ct)}`;
}

/** Opens either kind of letter body with the unlocked letter key. */
export async function decryptLetter(letterKey: CryptoKey, bundle: Pick<KeyBundle, "private_key_wrapped">, body: string) {
  if (!body.startsWith(BODY2_PREFIX)) return decryptBody(letterKey, body);
  if (!bundle.private_key_wrapped) throw new Error("No letter pair to open this with.");
  const [eph, iv, ct] = body.slice(BODY2_PREFIX.length).split(".");
  const ephRaw = fromB64(eph);
  const ephKey = await subtle().importKey("raw", ephRaw as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const priv = await openPrivateKey(letterKey, bundle.private_key_wrapped);
  const shared = await subtle().deriveBits({ name: "ECDH", public: ephKey }, priv, 256);
  const plain = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(iv) as BufferSource, additionalData: BODY2_AAD },
    await bodyKey(shared, ephRaw),
    fromB64(ct) as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

// ---- the email key

/**
 * A new email key for the letter key: `emailKey` goes to the person by email (never stored by
 * hidl), `email_share` is stored, and only both together unwrap `email_wrapped_key`.
 */
export async function createEmailKey(letterKey: CryptoKey) {
  const emailHalf = random(32);
  const serverHalf = random(32);
  const wrapping = await hkdfKey(concat(emailHalf, serverHalf), "hidl:email-key:v1");
  return {
    parts: { email_wrapped_key: await wrap(letterKey, wrapping), email_share: toB64(serverHalf) },
    /** For the link: URL-safe base64. */
    emailKey: toB64Url(emailHalf),
    /** For typing in: hex groups. */
    emailKeyText: formatEmailKey(emailHalf),
  };
}

export async function unlockWithEmailKey(bundle: KeyBundle, input: string, extractable = false) {
  const emailHalf = parseEmailKey(input);
  if (!emailHalf || !bundle.email_wrapped_key || !bundle.email_share) throw new WrongSecretError("email key");
  try {
    const wrapping = await hkdfKey(concat(emailHalf, fromB64(bundle.email_share)), "hidl:email-key:v1");
    return await unwrap(bundle.email_wrapped_key, wrapping, extractable);
  } catch {
    throw new WrongSecretError("email key");
  }
}

// ---- passkeys (the PRF output comes from src/lib/passkey.ts)

export async function wrapForPasskey(letterKey: CryptoKey, prfOutput: Uint8Array) {
  return wrap(letterKey, await hkdfKey(prfOutput, "hidl:passkey:v1"));
}

export async function unlockWithPasskey(wrapped: string, prfOutput: Uint8Array, extractable = false) {
  try {
    return await unwrap(wrapped, await hkdfKey(prfOutput, "hidl:passkey:v1"), extractable);
  } catch {
    throw new WrongSecretError("passkey");
  }
}

function concat(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/** A brand-new letter key, extractable so the ways in can be added; keep only nonExtractable(). */
export function newLetterKey() {
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]) as Promise<CryptoKey>;
}

/** A passphrase as a way in (setting one, or changing it): needs the extractable letter key. */
export async function passphraseParts(letterKey: CryptoKey, passphrase: string, iterations = KDF_ITERATIONS) {
  const salt = random(16);
  return {
    kdf_salt: toB64(salt),
    kdf_iterations: iterations,
    passphrase_wrapped_key: await wrap(letterKey, await passphraseKey(passphrase, salt, iterations)),
  };
}

// ---- setup, unlock, change passphrase

/** First-time setup: a new letter key, wrapped by the passphrase and by a new recovery key. */
export async function createKeyBundle(passphrase: string, iterations = KDF_ITERATIONS) {
  const letterKey = await subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const salt = random(16);
  const recovery = random(32);
  const bundle: PassphraseParts & { kdf_salt: string; kdf_iterations: number; passphrase_wrapped_key: string; recovery_wrapped_key: string } = {
    kdf_salt: toB64(salt),
    kdf_iterations: iterations,
    passphrase_wrapped_key: await wrap(letterKey, await passphraseKey(passphrase, salt, iterations)),
    recovery_wrapped_key: await wrap(letterKey, await recoveryKey(recovery)),
  };
  // Hand back a non-extractable copy for use: the raw key never needs to leave WebCrypto again.
  const usable = await unwrap(bundle.recovery_wrapped_key, await recoveryKey(recovery), false);
  return { bundle, recoveryKey: formatRecoveryKey(recovery), letterKey: usable };
}

export async function unlockWithPassphrase(bundle: PassphraseParts, passphrase: string, extractable = false) {
  if (!bundle.kdf_salt || !bundle.kdf_iterations || !bundle.passphrase_wrapped_key) throw new WrongSecretError("passphrase");
  const key = await passphraseKey(passphrase, fromB64(bundle.kdf_salt), bundle.kdf_iterations);
  try {
    return await unwrap(bundle.passphrase_wrapped_key, key, extractable);
  } catch {
    throw new WrongSecretError("passphrase");
  }
}

export async function unlockWithRecoveryKey(bundle: PassphraseParts, recoveryText: string, extractable = false) {
  const bytes = parseRecoveryKey(recoveryText);
  if (!bytes || !bundle.recovery_wrapped_key) throw new WrongSecretError("recovery key");
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
  bundle: PassphraseParts,
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
  return body.startsWith(BODY_PREFIX) || body.startsWith(BODY2_PREFIX);
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
  if (!body.startsWith(BODY_PREFIX)) throw new Error("Not an encrypted letter.");
  const [iv, ct] = body.slice(BODY_PREFIX.length).split(".");
  const plain = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64(iv) as BufferSource, additionalData: BODY_AAD },
    letterKey,
    fromB64(ct) as BufferSource,
  );
  return new TextDecoder().decode(plain);
}
