import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLetterMeta, openLetter } from "@/lib/data/letters";
import { encryptBody, newLetterKey } from "@/lib/e2ee";
import { sealLetterBody } from "@/lib/letter-crypto";
import { admin, createTestUser, deleteTestUser, inSeconds, sleep, type TestUser } from "./helpers";

let me: TestUser;
let other: TestUser;
let letterKey: CryptoKey;

async function insertE2E(text: string, unlockAt: string) {
  const { data, error } = await me.client
    .from("letters")
    .insert({ title: "Old", recipient: "Future me", body: await encryptBody(letterKey, text), encrypted: true, unlock_at: unlockAt })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

const reseal = (who: TestUser, id: string, text: string) =>
  who.client.rpc("reseal_opened_letter", { letter_id: id, new_body: sealLetterBody(text, who.id) });

beforeAll(async () => {
  process.env.LETTER_SECRET_KEY ||= randomBytes(32).toString("base64");
  [me, other] = await Promise.all([createTestUser(), createTestUser()]);
  letterKey = await newLetterKey();
});

afterAll(async () => {
  await Promise.all([deleteTestUser(me), deleteTestUser(other)]);
});

describe("moving an opened end-to-end letter to the server-sealed kind", () => {
  it("works once, for the owner, after the letter is opened", async () => {
    const id = await insertE2E("ሰላም from the past", inSeconds(2));

    // Still sealed: refused, so it can't be used to change a letter before its date.
    expect((await reseal(me, id, "swapped early")).error?.code).toBe("42501");

    await sleep(2500);
    await openLetter(me.client, id, me.id);
    // Someone else can't touch it.
    expect((await reseal(other, id, "not mine")).error).not.toBeNull();

    expect((await reseal(me, id, "ሰላም from the past")).error).toBeNull();
    expect((await getLetterMeta(me.client, id))?.encrypted).toBe(false);
    expect((await openLetter(me.client, id, me.id)).body).toBe("ሰላም from the past");

    // Only once: it's no longer an end-to-end letter.
    expect((await reseal(me, id, "rewritten")).error?.code).toBe("42501");
  });

  it("refuses a body that isn't sealed by the server", async () => {
    const id = await insertE2E("x", inSeconds(2));
    await sleep(2500);
    await openLetter(me.client, id, me.id);
    const { error } = await me.client.rpc("reseal_opened_letter", { letter_id: id, new_body: "plain text" });
    expect(error?.code).toBe("22023");
  });

  it("leaves a body unchangeable everywhere else", async () => {
    const id = await insertE2E("x", inSeconds(3600));
    const { error } = await admin.from("letters").update({ body: sealLetterBody("y", me.id) }).eq("id", id);
    expect(error?.code).toBe("42501");
  });
});

describe("rotate_letter_body", () => {
  it("is for the server only, and swaps only the body it read", async () => {
    const before = sealLetterBody("rotate me", me.id);
    const { data, error } = await me.client
      .from("letters")
      .insert({ title: "New", recipient: "Future me", body: before, encrypted: false, unlock_at: inSeconds(3600) })
      .select("id")
      .single();
    expect(error).toBeNull();
    const id = data!.id as string;
    const after = sealLetterBody("rotate me", me.id);

    expect((await me.client.rpc("rotate_letter_body", { letter_id: id, old_body: before, new_body: after })).error).not.toBeNull();

    const stale = await admin.rpc("rotate_letter_body", { letter_id: id, old_body: after, new_body: after });
    expect(stale.data).toBe(false);

    const swapped = await admin.rpc("rotate_letter_body", { letter_id: id, old_body: before, new_body: after });
    expect(swapped.error).toBeNull();
    expect(swapped.data).toBe(true);
    const { data: row } = await admin.from("letters").select("body").eq("id", id).single();
    expect(row?.body).toBe(after);
  });

  it("never touches an end-to-end letter", async () => {
    const id = await insertE2E("x", inSeconds(3600));
    const { data: row } = await admin.from("letters").select("body").eq("id", id).single();
    const r = await admin.rpc("rotate_letter_body", { letter_id: id, old_body: row!.body, new_body: sealLetterBody("y", me.id) });
    expect(r.data).toBe(false);
  });
});
