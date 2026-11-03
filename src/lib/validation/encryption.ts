import { z } from "zod";

/** Shapes only: the server can't (and doesn't try to) check that the key material is real. */
const b64Salt = z.string().regex(/^[A-Za-z0-9+/]{22}==$/);
const wrappedKey = z.string().regex(/^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{64}$/);
const iterations = z.number().int().min(100_000).max(10_000_000);

export const keyBundleSchema = z.object({
  kdf_salt: b64Salt,
  kdf_iterations: iterations,
  passphrase_wrapped_key: wrappedKey,
  recovery_wrapped_key: wrappedKey,
});

export const passphraseUpdateSchema = z.object({
  kdf_salt: b64Salt,
  kdf_iterations: iterations,
  passphrase_wrapped_key: wrappedKey,
});

/** An encrypted letter body, as produced by encryptBody() in src/lib/e2ee.ts. */
export const encryptedBody = z
  .string()
  .max(210_000, "That letter is too long.")
  .regex(/^e2e1\.[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]+={0,2}$/, "Your letter wasn't encrypted. Reload the page and try again.");
