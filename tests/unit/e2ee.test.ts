import { describe, expect, it } from "vitest";
import {
  WrongSecretError,
  createKeyBundle,
  decryptBody,
  encryptBody,
  isEncryptedBody,
  parseRecoveryKey,
  rewrapWithNewPassphrase,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from "@/lib/e2ee";

// Low iteration count keeps the tests fast; the format and logic are the same.
const IT = 1000;

describe("letter encryption", () => {
  it("round-trips a letter body, including non-Latin text and emoji", async () => {
    const { letterKey } = await createKeyBundle("correct horse battery", IT);
    const text = "Dear me,\n\nሰላም! You made it 🎓 — **proud** of you.";
    const body = await encryptBody(letterKey, text);
    expect(isEncryptedBody(body)).toBe(true);
    expect(body).not.toContain("proud");
    expect(await decryptBody(letterKey, body)).toBe(text);
  });

  it("produces the shapes the database checks", async () => {
    const { bundle, letterKey } = await createKeyBundle("correct horse battery", IT);
    expect(bundle.kdf_salt).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(bundle.passphrase_wrapped_key).toMatch(/^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{64}$/);
    expect(bundle.recovery_wrapped_key).toMatch(/^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{64}$/);
    expect(await encryptBody(letterKey, "hi")).toMatch(/^e2e1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$/);
  });

  it("encrypting the same text twice gives different ciphertext", async () => {
    const { letterKey } = await createKeyBundle("correct horse battery", IT);
    expect(await encryptBody(letterKey, "same")).not.toBe(await encryptBody(letterKey, "same"));
  });

  it("the passphrase and the recovery key both unlock the same letter key", async () => {
    const { bundle, recoveryKey, letterKey } = await createKeyBundle("correct horse battery", IT);
    const body = await encryptBody(letterKey, "secret");
    const viaPass = await unlockWithPassphrase(bundle, "correct horse battery");
    const viaRecovery = await unlockWithRecoveryKey(bundle, recoveryKey.toLowerCase().replaceAll("-", " "));
    expect(await decryptBody(viaPass, body)).toBe("secret");
    expect(await decryptBody(viaRecovery, body)).toBe("secret");
  });

  it("rejects a wrong passphrase or recovery key", async () => {
    const { bundle } = await createKeyBundle("correct horse battery", IT);
    await expect(unlockWithPassphrase(bundle, "wrong horse battery")).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unlockWithRecoveryKey(bundle, "0".repeat(64))).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unlockWithRecoveryKey(bundle, "too short")).rejects.toBeInstanceOf(WrongSecretError);
  });

  it("a different user's key can't decrypt, and tampering is detected", async () => {
    const a = await createKeyBundle("passphrase number one", IT);
    const b = await createKeyBundle("passphrase number two", IT);
    const body = await encryptBody(a.letterKey, "only for a");
    await expect(decryptBody(b.letterKey, body)).rejects.toThrow();
    const flipped = body.slice(0, -4) + (body.at(-4) === "A" ? "B" : "A") + body.slice(-3);
    await expect(decryptBody(a.letterKey, flipped)).rejects.toThrow();
  });

  it("changing the passphrase keeps old letters readable and retires the old passphrase", async () => {
    const { bundle, recoveryKey, letterKey } = await createKeyBundle("old passphrase here", IT);
    const body = await encryptBody(letterKey, "written before the change");

    const changed = { ...bundle, ...(await rewrapWithNewPassphrase(bundle, { passphrase: "old passphrase here" }, "new passphrase here", IT)) };
    expect(await decryptBody(await unlockWithPassphrase(changed, "new passphrase here"), body)).toBe("written before the change");
    await expect(unlockWithPassphrase(changed, "old passphrase here")).rejects.toBeInstanceOf(WrongSecretError);

    // Reset with the recovery key when the passphrase is forgotten.
    const reset = { ...changed, ...(await rewrapWithNewPassphrase(changed, { recoveryKey }, "third passphrase", IT)) };
    expect(await decryptBody(await unlockWithPassphrase(reset, "third passphrase"), body)).toBe("written before the change");
  });

  it("the unlocked key can't be exported", async () => {
    const { bundle } = await createKeyBundle("correct horse battery", IT);
    const key = await unlockWithPassphrase(bundle, "correct horse battery");
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("parses recovery keys however they're typed", () => {
    const hex = "AB".repeat(32);
    expect(parseRecoveryKey(hex)).toHaveLength(32);
    expect(parseRecoveryKey(hex.match(/.{4}/g)!.join("-").toLowerCase())).toHaveLength(32);
    expect(parseRecoveryKey("ABCD")).toBeNull();
  });
});
