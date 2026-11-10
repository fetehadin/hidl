/**
 * Fingerprint / Face ID through passkeys (WebAuthn), browser only.
 *
 * Letters use the PRF extension: the passkey turns a fixed salt into 32 secret bytes that only
 * that passkey can make, and only after the person's fingerprint or face. Those bytes wrap the
 * letter key (wrapForPasskey in src/lib/e2ee.ts), so a passkey unlocks letters with no
 * passphrase. Passkeys sync through the person's Apple or Google account, so a new phone years
 * later still has it. Nothing is checked on the server: the secret itself is the proof.
 *
 * The app lock uses a plain passkey check (userVerification "required"): it's a privacy screen
 * on the device, like the PIN, not encryption.
 */

/** The PRF salt: fixed, so any of the person's passkeys can be asked without knowing which. */
const PRF_SALT = new TextEncoder().encode("hidl letters: passkey PRF salt, v1").slice(0, 32);

type PrfResults = { enabled?: boolean; results?: { first?: ArrayBuffer } };

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function toB64Url(bytes: ArrayBuffer | Uint8Array) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(s: string) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Whether this browser can make passkeys with a fingerprint / face / device PIN at all. */
export async function passkeysAvailable() {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export class PasskeyError extends Error {
  constructor(
    public reason: "cancelled" | "unsupported" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "PasskeyError";
  }
}

function explain(e: unknown): never {
  if (e instanceof PasskeyError) throw e;
  if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError")) {
    throw new PasskeyError("cancelled", "Cancelled. Try again when you're ready.");
  }
  throw new PasskeyError("failed", "This device couldn't use a passkey. Try another way.");
}

function creationOptions(user: { id: string; email: string }, label: string, prf: boolean): CredentialCreationOptions {
  return {
    publicKey: {
      rp: { name: "hidl", id: location.hostname },
      user: { id: new TextEncoder().encode(`${user.id}:${label}`), name: user.email || "hidl", displayName: label },
      challenge: random(32),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      timeout: 120_000,
      ...(prf ? { extensions: { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs } : {}),
    },
  };
}

async function prfFrom(credentialIds: string[]) {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      rpId: location.hostname,
      allowCredentials: credentialIds.map((id) => ({ type: "public-key" as const, id: fromB64Url(id) })),
      userVerification: "required",
      timeout: 120_000,
      extensions: { prf: { eval: { first: PRF_SALT } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new PasskeyError("cancelled", "Cancelled.");
  const prf = (assertion.getClientExtensionResults() as { prf?: PrfResults }).prf;
  if (!prf?.results?.first) {
    throw new PasskeyError("unsupported", "This passkey can't unlock letters on this device. Use another way.");
  }
  return { credentialId: toB64Url(assertion.rawId), secret: new Uint8Array(prf.results.first) };
}

/**
 * A new passkey for letters. Returns its id and its PRF secret, or throws PasskeyError
 * "unsupported" when the device makes passkeys but not PRF secrets (then it isn't saved).
 */
export async function createLetterPasskey(user: { id: string; email: string }) {
  try {
    const cred = (await navigator.credentials.create(creationOptions(user, "hidl letters", true))) as PublicKeyCredential | null;
    if (!cred) throw new PasskeyError("cancelled", "Cancelled.");
    const prf = (cred.getClientExtensionResults() as { prf?: PrfResults }).prf;
    if (prf?.enabled === false) {
      throw new PasskeyError("unsupported", "This device can't use fingerprint or Face ID for letters yet.");
    }
    const credentialId = toB64Url(cred.rawId);
    // Some devices give the secret at creation; others only on the first use.
    if (prf?.results?.first) return { credentialId, secret: new Uint8Array(prf.results.first) };
    return await prfFrom([credentialId]);
  } catch (e) {
    explain(e);
  }
}

/** Fingerprint / Face ID with one of the person's letter passkeys: which one, and its secret. */
export async function askLetterPasskey(credentialIds: string[]) {
  try {
    return await prfFrom(credentialIds);
  } catch (e) {
    explain(e);
  }
}

/** A passkey for the app lock (no PRF needed). Returns its id. */
export async function createLockPasskey(user: { id: string; email: string }) {
  try {
    const cred = (await navigator.credentials.create(creationOptions(user, "hidl app lock", false))) as PublicKeyCredential | null;
    if (!cred) throw new PasskeyError("cancelled", "Cancelled.");
    return toB64Url(cred.rawId);
  } catch (e) {
    explain(e);
  }
}

/** The app lock check: true once the fingerprint / face (or device PIN) matched. */
export async function checkLockPasskey(credentialId: string) {
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        rpId: location.hostname,
        allowCredentials: [{ type: "public-key", id: fromB64Url(credentialId) }],
        userVerification: "required",
        timeout: 120_000,
      },
    });
    return Boolean(assertion);
  } catch (e) {
    explain(e);
  }
}
