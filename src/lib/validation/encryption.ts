import { z } from "zod";

/** Shapes only: the server can't (and doesn't try to) check that the key material is real. */
const b64Salt = z.string().regex(/^[A-Za-z0-9+/]{22}==$/);
const wrappedKey = z.string().regex(/^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{64}$/);
const iterations = z.number().int().min(100_000).max(10_000_000);
const publicKey = z.string().regex(/^[A-Za-z0-9+/]{87}=$/);
const privateKeyWrapped = z.string().regex(/^[A-Za-z0-9+/]{16}\.[A-Za-z0-9+/]{60,560}={0,2}$/);
const emailShare = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);

export const passphraseUpdateSchema = z.object({
  kdf_salt: b64Salt,
  kdf_iterations: iterations,
  passphrase_wrapped_key: wrappedKey,
});

const pairParts = { public_key: publicKey, private_key_wrapped: privateKeyWrapped };
const emailParts = { email_wrapped_key: wrappedKey, email_share: emailShare };

/** First-time setup: the key pair and the email key; a passphrase only if the person wants one. */
export const keySetupSchema = z.object({ ...pairParts, ...emailParts, passphrase: passphraseUpdateSchema.optional() });

/** Accounts from before the key pair / email key: whatever they're missing, added on unlock. */
export const keyUpgradeSchema = z.object({
  pair: z.object(pairParts).optional(),
  email: z.object(emailParts).optional(),
});

/** A new email key (the old email stops working). */
export const emailKeyPartsSchema = z.object(emailParts);

/** The email half of the email key, to send: URL-safe base64 of 32 bytes. */
export const emailKeySchema = z.object({ key: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

export const passkeySchema = z.object({
  credential_id: z.string().regex(/^[A-Za-z0-9_-]{16,1400}$/),
  wrapped_key: wrappedKey,
});

export const credentialIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,1400}$/);

/** An encrypted letter body, as produced by src/lib/e2ee.ts (e2e1 older, e2e2 to the public key). */
export const encryptedBody = z
  .string()
  .max(210_000, "That letter is too long.")
  .regex(
    /^(e2e1\.[A-Za-z0-9+/]{16}|e2e2\.[A-Za-z0-9+/]{87}=\.[A-Za-z0-9+/]{16})\.[A-Za-z0-9+/]+={0,2}$/,
    "Your letter wasn't encrypted. Reload the page and try again.",
  );
