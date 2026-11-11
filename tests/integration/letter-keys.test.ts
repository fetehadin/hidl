import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openLetter } from "@/lib/data/letters";
import {
  createEmailKey,
  createKeyBundle,
  createLetterPair,
  decryptLetter,
  encryptForPublicKey,
  newLetterKey,
  unlockWithEmailKey,
  unlockWithPassphrase,
  wrapForPasskey,
} from "@/lib/e2ee";
import { createTestUser, deleteTestUser, inSeconds, sleep, type TestUser } from "./helpers";

// ..._letter_keys_ways_in.sql: no-passphrase setup, the key pair, the email key, passkeys.
let me: TestUser;
let other: TestUser;
let legacy: TestUser;

beforeAll(async () => {
  [me, other, legacy] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
});
afterAll(async () => {
  await Promise.all([deleteTestUser(me), deleteTestUser(other), deleteTestUser(legacy)]);
});

describe("setting up without a passphrase", () => {
  let letterKey: CryptoKey;
  let pair: Awaited<ReturnType<typeof createLetterPair>>;
  let email: Awaited<ReturnType<typeof createEmailKey>>;

  beforeAll(async () => {
    letterKey = await newLetterKey();
    pair = await createLetterPair(letterKey);
    email = await createEmailKey(letterKey);
  });

  it("refuses keys with no way in at all", async () => {
    const { error } = await me.client.from("letter_keys").insert({ ...pair });
    expect(error).not.toBeNull();
  });

  it("stores the pair and the email key", async () => {
    const { error } = await me.client.from("letter_keys").insert({ ...pair, ...email.parts });
    expect(error).toBeNull();
  });

  it("writes a letter to the public key, and opens it with the email key once it unlocks", async () => {
    const body = await encryptForPublicKey(pair.public_key, "five years later");
    const { data, error } = await me.client
      .from("letters")
      .insert({ title: "Later", recipient: "Future me", body, encrypted: true, unlock_at: inSeconds(2) })
      .select("id")
      .single();
    expect(error).toBeNull();
    await sleep(2500);
    const opened = await openLetter(me.client, data!.id, me.id);
    const { data: bundle } = await me.client.from("letter_keys").select("*").single();
    const key = await unlockWithEmailKey(bundle, email.emailKey);
    expect(await decryptLetter(key, bundle, opened.body)).toBe("five years later");
  });

  it("the key pair can't be replaced, but a new email key and a passphrase can be added", async () => {
    const otherPair = await createLetterPair(letterKey);
    const swap = await me.client.from("letter_keys").update(otherPair).eq("user_id", me.id);
    expect(swap.error).not.toBeNull();

    const fresh = await createEmailKey(letterKey);
    expect((await me.client.from("letter_keys").update(fresh.parts).eq("user_id", me.id)).error).toBeNull();
    // Half an email key is refused.
    const half = await me.client.from("letter_keys").update({ email_share: email.parts.email_share, email_wrapped_key: null }).eq("user_id", me.id);
    expect(half.error).not.toBeNull();
  });

  it("refuses a body that isn't either encrypted format", async () => {
    const { error } = await me.client
      .from("letters")
      .insert({ title: "x", recipient: "y", body: "e2e2.not-really", encrypted: true, unlock_at: inSeconds(60) });
    expect(error).not.toBeNull();
  });
});

describe("letter_passkeys", () => {
  it("are private to their owner and can be removed", async () => {
    const letterKey = await newLetterKey();
    const row = { credential_id: "cred_" + "a".repeat(20), wrapped_key: await wrapForPasskey(letterKey, new Uint8Array(32).fill(7)) };
    expect((await me.client.from("letter_passkeys").insert(row)).error).toBeNull();
    expect((await other.client.from("letter_passkeys").select("credential_id")).data).toEqual([]);
    expect((await other.client.from("letter_passkeys").insert({ ...row, credential_id: "cred_" + "b".repeat(20) })).error).toBeNull();
    // Someone else can't delete mine.
    await other.client.from("letter_passkeys").delete().eq("credential_id", row.credential_id);
    expect((await me.client.from("letter_passkeys").select("credential_id")).data).toHaveLength(1);
    await me.client.from("letter_passkeys").delete().eq("credential_id", row.credential_id);
    expect((await me.client.from("letter_passkeys").select("credential_id")).data).toHaveLength(0);
  });

  it("stop at 10 per person", async () => {
    const wrapped = await wrapForPasskey(await newLetterKey(), new Uint8Array(32).fill(1));
    for (let i = 0; i < 10; i++) {
      const { error } = await me.client.from("letter_passkeys").insert({ credential_id: `limit_${i}_${"c".repeat(16)}`, wrapped_key: wrapped });
      expect(error).toBeNull();
    }
    const { error } = await me.client.from("letter_passkeys").insert({ credential_id: `limit_x_${"c".repeat(16)}`, wrapped_key: wrapped });
    expect(error?.code).toBe("53400");
  });
});

describe("an account from before (passphrase only)", () => {
  it("gets a key pair and an email key added on unlock, and its old letters still open", async () => {
    const old = await createKeyBundle("legacy passphrase", 100_000);
    expect((await legacy.client.from("letter_keys").insert(old.bundle)).error).toBeNull();

    const extractable = await unlockWithPassphrase(old.bundle, "legacy passphrase", true);
    const pair = await createLetterPair(extractable);
    const email = await createEmailKey(extractable);
    const { error } = await legacy.client.from("letter_keys").update({ ...pair, ...email.parts }).eq("user_id", legacy.id);
    expect(error).toBeNull();

    const { data: bundle } = await legacy.client.from("letter_keys").select("*").single();
    expect(bundle.passphrase_wrapped_key).toBe(old.bundle.passphrase_wrapped_key);
    const viaEmail = await unlockWithEmailKey(bundle, email.emailKey);
    const body = await encryptForPublicKey(bundle.public_key, "new letter, old account");
    expect(await decryptLetter(viaEmail, bundle, body)).toBe("new letter, old account");
  });
});
