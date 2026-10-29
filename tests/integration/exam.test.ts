import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, createTestUser, deleteTestUser, inSeconds, type TestUser } from "./helpers";

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
    const { data } = await other.client.from("exam_settings").select("exam_name");
    expect(data).toEqual([]);
  });

  it("widget_token_hash is not selectable by anyone, even the owner", async () => {
    const { error } = await me.client.from("exam_settings").select("widget_token_hash");
    expect(error?.code).toBe("42501");
  });
});

describe("widget token", () => {
  it("the owner can set their own token hash, and it's findable by hash via the service role", async () => {
    const hash = createHash("sha256").update("a-raw-token").digest("hex");
    const set = await me.client
      .from("exam_settings")
      .update({ widget_token_hash: hash, widget_token_created_at: new Date().toISOString() })
      .eq("user_id", me.id);
    expect(set.error).toBeNull();

    const { data, error } = await admin
      .from("exam_settings")
      .select("exam_name, target_score")
      .eq("widget_token_hash", hash)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data?.target_score).toBe(650);
  });

  it("a wrong hash finds nothing", async () => {
    const { data } = await admin
      .from("exam_settings")
      .select("exam_name")
      .eq("widget_token_hash", "not-a-real-hash")
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("clearing the token hash makes it unfindable again", async () => {
    const hash = createHash("sha256").update("a-raw-token").digest("hex");
    await me.client.from("exam_settings").update({ widget_token_hash: null, widget_token_created_at: null }).eq("user_id", me.id);
    const { data } = await admin.from("exam_settings").select("exam_name").eq("widget_token_hash", hash).maybeSingle();
    expect(data).toBeNull();
  });
});
