import { describe, expect, it } from "vitest";
import {
  WrongSecretError,
  createEmailKey,
  createKeyBundle,
  createLetterPair,
  decryptLetter,
  encryptBody,
  encryptForPublicKey,
  type KeyBundle,
  newLetterKey,
  nonExtractable,
  parseEmailKey,
  passphraseParts,
  unlockWithEmailKey,
  unlockWithPasskey,
  unlockWithPassphrase,
  wrapForPasskey,
} from "@/lib/e2ee";
import { letterKeyEmail } from "@/lib/letter-key-email";
import { encryptedBody, keySetupSchema } from "@/lib/validation/encryption";

// The newer ways in (src/lib/e2ee.ts): writing to a public key, the email key, passkeys.
const IT = 1000;

async function freshBundle() {
  const letterKey = await newLetterKey();
  const pair = await createLetterPair(letterKey);
  const email = await createEmailKey(letterKey);
  const bundle: KeyBundle = {
    kdf_salt: null,
    kdf_iterations: null,
    passphrase_wrapped_key: null,
    recovery_wrapped_key: null,
    ...pair,
    ...email.parts,
  };
  return { letterKey, bundle, email };
}

describe("writing without unlocking", () => {
  it("a letter encrypted to the public key opens with the letter key", async () => {
    const { letterKey, bundle } = await freshBundle();
    const text = "Dear me,\n\nሰላም! You made it 🎓";
    const body = await encryptForPublicKey(bundle.public_key!, text);
    expect(body).not.toContain("made it");
    expect(await decryptLetter(await nonExtractable(letterKey), bundle, body)).toBe(text);
  });

  it("each letter is encrypted differently, and someone else's key can't open it", async () => {
    const a = await freshBundle();
    const b = await freshBundle();
    const one = await encryptForPublicKey(a.bundle.public_key!, "same text");
    const two = await encryptForPublicKey(a.bundle.public_key!, "same text");
    expect(one).not.toBe(two);
    await expect(decryptLetter(b.letterKey, b.bundle, one)).rejects.toThrow();
    // b's letter key can't open a's private key either.
    await expect(decryptLetter(b.letterKey, a.bundle, one)).rejects.toThrow();
  });

  it("older letters (encrypted with the letter key itself) still open", async () => {
    const { letterKey, bundle } = await freshBundle();
    const old = await encryptBody(letterKey, "from before");
    expect(await decryptLetter(letterKey, bundle, old)).toBe("from before");
  });

  it("produces the shapes the server and database accept", async () => {
    const { bundle, email } = await freshBundle();
    expect(keySetupSchema.safeParse({ ...bundle, ...email.parts }).success).toBe(true);
    expect(encryptedBody.safeParse(await encryptForPublicKey(bundle.public_key!, "x".repeat(5000))).success).toBe(true);
  });
});

describe("the email key", () => {
  it("opens letters from the link or typed in, and needs the stored half too", async () => {
    const { letterKey, bundle, email } = await freshBundle();
    const body = await encryptForPublicKey(bundle.public_key!, "hello from the past");
    for (const input of [email.emailKey, email.emailKeyText, email.emailKeyText.toLowerCase().replace(/-/g, " ")]) {
      const k = await unlockWithEmailKey(bundle, input);
      expect(await decryptLetter(k, bundle, body)).toBe("hello from the past");
    }
    // The email half alone, against a different stored half, opens nothing.
    const other = await createEmailKey(letterKey);
    await expect(unlockWithEmailKey({ ...bundle, email_share: other.parts.email_share }, email.emailKey)).rejects.toBeInstanceOf(
      WrongSecretError,
    );
    await expect(unlockWithEmailKey(bundle, "not a key")).rejects.toBeInstanceOf(WrongSecretError);
  });

  it("a new email key retires the old one", async () => {
    const { letterKey, bundle, email } = await freshBundle();
    const fresh = await createEmailKey(letterKey);
    const updated = { ...bundle, ...fresh.parts };
    await expect(unlockWithEmailKey(updated, email.emailKey)).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unlockWithEmailKey(updated, fresh.emailKey)).resolves.toBeDefined();
  });

  it("parses the link form and the typed form to the same bytes", async () => {
    const { email } = await freshBundle();
    expect(parseEmailKey(email.emailKey)).toEqual(parseEmailKey(email.emailKeyText));
    expect(parseEmailKey("short")).toBeNull();
  });

  it("the email puts the key in the link's #fragment, never in the path or query", async () => {
    const { email } = await freshBundle();
    const mail = letterKeyEmail("https://hidl.example", email.emailKey, email.emailKeyText);
    expect(mail.html).toContain(`https://hidl.example/letters/key#k=${email.emailKey}`);
    expect(mail.text).toContain(email.emailKeyText);
    expect(mail.html).not.toMatch(/letters\/key\?/);
  });
});

describe("passkeys and the passphrase as ways in", () => {
  it("a passkey's PRF secret unwraps the letter key; another secret doesn't", async () => {
    const { letterKey, bundle } = await freshBundle();
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapForPasskey(letterKey, secret);
    expect(wrapped).toMatch(/^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{64}$/);
    const body = await encryptForPublicKey(bundle.public_key!, "touch to open");
    expect(await decryptLetter(await unlockWithPasskey(wrapped, secret), bundle, body)).toBe("touch to open");
    await expect(unlockWithPasskey(wrapped, crypto.getRandomValues(new Uint8Array(32)))).rejects.toBeInstanceOf(WrongSecretError);
  });

  it("a passphrase can be added later, and an old passphrase account gets a pair on unlock", async () => {
    const { letterKey, bundle } = await freshBundle();
    const withPass = { ...bundle, ...(await passphraseParts(letterKey, "a long passphrase", IT)) };
    await expect(unlockWithPassphrase(withPass, "a long passphrase")).resolves.toBeDefined();

    // An account from before: passphrase only. Unlocking gives an extractable key to add the rest.
    const old = await createKeyBundle("older passphrase", IT);
    const extractable = await unlockWithPassphrase(old.bundle, "older passphrase", true);
    const pair = await createLetterPair(extractable);
    const upgraded: KeyBundle = { ...old.bundle, ...pair, email_wrapped_key: null, email_share: null };
    const body = await encryptForPublicKey(pair.public_key, "after the upgrade");
    expect(await decryptLetter(old.letterKey, upgraded, body)).toBe("after the upgrade");
  });

  it("the key a device keeps can't be read out", async () => {
    const key = await nonExtractable(await newLetterKey());
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });
});
