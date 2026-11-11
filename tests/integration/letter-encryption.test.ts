import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openLetter } from "@/lib/data/letters";
import { createKeyBundle, decryptBody, encryptBody, unlockWithPassphrase } from "@/lib/e2ee";
import { createTestUser, deleteTestUser, inSeconds, sleep, type TestUser } from "./helpers";

// Real key material from src/lib/e2ee.ts (low iteration count, same formats).
const IT = 100_000;
let me: TestUser;
let other: TestUser;
let mine: Awaited<ReturnType<typeof createKeyBundle>>;

beforeAll(async () => {
  [me, other] = await Promise.all([createTestUser(), createTestUser()]);
  mine = await createKeyBundle("my long passphrase", IT);
});
afterAll(async () => {
  await Promise.all([deleteTestUser(me), deleteTestUser(other)]);
});

describe("letter_keys", () => {
  it("lets a user store their wrapped key once, and read it back", async () => {
    const { error } = await me.client.from("letter_keys").insert(mine.bundle);
    expect(error).toBeNull();
    const { data } = await me.client.from("letter_keys").select("*").single();
    expect(data?.passphrase_wrapped_key).toBe(mine.bundle.passphrase_wrapped_key);
    expect(data?.user_id).toBe(me.id);

    const again = await me.client.from("letter_keys").insert((await createKeyBundle("another one here", IT)).bundle);
    expect(again.error).not.toBeNull(); // never overwritten: letters depend on that key
  });

  it("is invisible to other users", async () => {
    const { data } = await other.client.from("letter_keys").select("*");
    expect(data).toEqual([]);
  });

  it("can't be stored for someone else", async () => {
    const { bundle } = await createKeyBundle("someone else's key", IT);
    const { error } = await other.client.from("letter_keys").insert({ ...bundle, user_id: me.id });
    expect(error).not.toBeNull();
  });

  it("can't be deleted, and the recovery copy can't be replaced", async () => {
    await me.client.from("letter_keys").delete().eq("user_id", me.id);
    const { data } = await me.client.from("letter_keys").select("user_id");
    expect(data).toHaveLength(1);

    const { error } = await me.client
      .from("letter_keys")
      .update({ recovery_wrapped_key: mine.bundle.passphrase_wrapped_key })
      .eq("user_id", me.id);
    expect(error).not.toBeNull();
  });

  it("rejects anything that isn't shaped like key material", async () => {
    const { error } = await other.client
      .from("letter_keys")
      .insert({ ...mine.bundle, passphrase_wrapped_key: "my passphrase is hunter2" });
    expect(error).not.toBeNull();
  });
});

describe("encrypted letters", () => {
  const insert = (body: string, encrypted: boolean, unlockAt = inSeconds(60 * 60)) =>
    me.client
      .from("letters")
      .insert({ title: "Secret", recipient: "Future me", body, encrypted, unlock_at: unlockAt })
      .select("id")
      .single();

  it("stores ciphertext, even when it's longer than the 50,000-character text limit", async () => {
    const body = await encryptBody(mine.letterKey, "ሰላም ".repeat(12_000)); // 48,000 chars of text
    expect(body.length).toBeGreaterThan(50_000);
    const { error } = await insert(body, true);
    expect(error).toBeNull();
  });

  it("refuses plain text marked as encrypted", async () => {
    const { error } = await insert("Dear me, this is not encrypted", true);
    expect(error).not.toBeNull();
  });

  it("the encrypted flag can't be changed after sealing", async () => {
    const { data } = await insert(await encryptBody(mine.letterKey, "x"), true);
    const { error } = await me.client.from("letters").update({ encrypted: false }).eq("id", data!.id);
    expect(error).not.toBeNull();
  });

  it("is still time-locked, then opens to ciphertext only the passphrase can decrypt", async () => {
    const text = "Only future me reads this.";
    const { data } = await insert(await encryptBody(mine.letterKey, text), true, inSeconds(2));
    await expect(openLetter(me.client, data!.id, me.id)).rejects.toThrow();

    await sleep(2500);
    const opened = await openLetter(me.client, data!.id, me.id);
    expect(opened.body).not.toContain("future me");
    const key = await unlockWithPassphrase(mine.bundle, "my long passphrase");
    expect(await decryptBody(key, opened.body)).toBe(text);
  });
});
