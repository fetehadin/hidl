import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, inSeconds, type TestUser } from "./helpers";

let me: TestUser;
let other: TestUser;

beforeAll(async () => {
  [me, other] = await Promise.all([createTestUser(), createTestUser()]);
});
afterAll(async () => {
  await Promise.all([deleteTestUser(me), deleteTestUser(other)]);
});

const settings = (examAt: string) => ({ exam_name: "Entrance", exam_at: examAt, target_score: 620, max_score: 700 });

describe("exam settings", () => {
  it("upserts a single row per user without sending user_id", async () => {
    const first = await me.client.from("exam_settings").upsert(settings(inSeconds(86400)), { onConflict: "user_id" });
    expect(first.error).toBeNull();
    const second = await me.client
      .from("exam_settings")
      .upsert({ ...settings(inSeconds(86400)), target_score: 650 }, { onConflict: "user_id" });
    expect(second.error).toBeNull();
    const { data } = await me.client.from("exam_settings").select("target_score");
    expect(data).toEqual([{ target_score: 650 }]);
  });

  it("refuses an actual score before the exam", async () => {
    const { error } = await me.client.from("exam_settings").update({ actual_score: 600 }).eq("user_id", me.id);
    expect(error?.message).toMatch(/after the exam/);
  });

  it("refuses a target above the max", async () => {
    const { error } = await me.client.from("exam_settings").update({ target_score: 701 }).eq("user_id", me.id);
    expect(error?.code).toBe("23514");
  });

  it("accepts a score once the exam has passed", async () => {
    // Moving the date into the past is allowed; then the score can be recorded.
    await me.client.from("exam_settings").update({ exam_at: inSeconds(-60) }).eq("user_id", me.id);
    const { error } = await me.client.from("exam_settings").update({ actual_score: 641 }).eq("user_id", me.id);
    expect(error).toBeNull();
  });

  it("is invisible to other users", async () => {
    const { data } = await other.client.from("exam_settings").select("*");
    expect(data).toEqual([]);
  });
});
