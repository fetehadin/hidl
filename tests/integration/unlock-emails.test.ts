import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type UnlockEmail, sendUnlockEmails } from "@/lib/unlock-emails";
import { admin, createTestUser, deleteTestUser, inSeconds, sleep, type TestUser } from "./helpers";

let me: TestUser;

beforeAll(async () => {
  me = await createTestUser();
});
afterAll(async () => deleteTestUser(me));

describe("unlock emails", () => {
  it("emails each unlocked letter once, without its body", async () => {
    const insert = (title: string, at: string) =>
      me.client.from("letters").insert({ title, recipient: "Future me", body: "TOP SECRET BODY", unlock_at: at });
    await insert("Unlocks now", inSeconds(1));
    await insert("Still sealed", inSeconds(3600));
    await sleep(1500);

    const outbox: UnlockEmail[] = [];
    const send = async (e: UnlockEmail) => void outbox.push(e);

    await sendUnlockEmails(admin, send, "https://hidl.test");
    const mine = outbox.filter((e) => e.to === me.email);
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toContain("Unlocks now");
    expect(mine[0].html + mine[0].text).not.toContain("TOP SECRET BODY");

    // Second run sends nothing new for this user.
    outbox.length = 0;
    await sendUnlockEmails(admin, send, "https://hidl.test");
    expect(outbox.filter((e) => e.to === me.email)).toHaveLength(0);
  });

  it("retries next time if sending fails", async () => {
    await me.client.from("letters").insert({ title: "Flaky", recipient: "r", body: "b", unlock_at: inSeconds(1) });
    await sleep(1500);
    const fail = async (e: UnlockEmail) => {
      if (e.to === me.email) throw new Error("smtp down");
    };
    const first = await sendUnlockEmails(admin, fail, "https://hidl.test");
    expect(first.failed.length).toBeGreaterThan(0);

    const outbox: UnlockEmail[] = [];
    await sendUnlockEmails(admin, async (e) => void outbox.push(e), "https://hidl.test");
    expect(outbox.some((e) => e.to === me.email && e.subject.includes("Flaky"))).toBe(true);
  });
});
