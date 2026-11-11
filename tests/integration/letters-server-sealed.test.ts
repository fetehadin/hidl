import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openLetter } from "@/lib/data/letters";
import { sealLetterBody } from "@/lib/letter-crypto";
import { createTestUser, deleteTestUser, inSeconds, sleep, type TestUser } from "./helpers";

let me: TestUser;

async function insert(body: string, unlockAt: string) {
  return me.client
    .from("letters")
    .insert({ title: "Later", recipient: "Future me", body, encrypted: false, unlock_at: unlockAt })
    .select("id")
    .single();
}

beforeAll(async () => {
  process.env.LETTER_SECRET_KEY ||= randomBytes(32).toString("base64");
  me = await createTestUser();
});

afterAll(async () => {
  await deleteTestUser(me);
});

describe("letters sealed on the server", () => {
  it("are stored as ciphertext and open as text once their date comes", async () => {
    const { data, error } = await insert(sealLetterBody("ሰላም, future me", me.id), inSeconds(2));
    expect(error).toBeNull();
    await sleep(2500);
    const opened = await openLetter(me.client, data!.id, me.id);
    expect(opened.body).toBe("ሰላም, future me");
  });

  it("may be longer than a plain body, since base64 grows the text", async () => {
    const long = "ሀ".repeat(30000); // 90,000 bytes of UTF-8
    const sealed = sealLetterBody(long, me.id);
    expect(sealed.length).toBeGreaterThan(50000);
    expect((await insert(sealed, inSeconds(3600))).error).toBeNull();
    // A plain body that long is still refused.
    expect((await insert("x".repeat(50001), inSeconds(3600))).error?.code).toBe("23514");
  });

  it("refuse a long body that only pretends to be sealed", async () => {
    const fake = `srv1.not-base64-at-all.${"A".repeat(60000)}`;
    expect((await insert(fake, inSeconds(3600))).error?.code).toBe("23514");
  });
});
