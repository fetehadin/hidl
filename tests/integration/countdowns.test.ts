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

const exam = (targetAt: string) => ({ kind: "exam", title: "Entrance", target_at: targetAt, target_score: 620, max_score: 700 });
const deadline = (targetAt: string) => ({ kind: "deadline", title: "Scholarship", target_at: targetAt });

describe("countdowns", () => {
  let examId: string;
  let deadlineId: string;

  it("allows an exam countdown with scores", async () => {
    const { data, error } = await me.client.from("countdowns").insert(exam(inSeconds(86400))).select("id").single();
    expect(error).toBeNull();
    examId = data!.id;
  });

  it("allows a plain deadline with no scores", async () => {
    const { data, error } = await me.client.from("countdowns").insert(deadline(inSeconds(172800))).select("id").single();
    expect(error).toBeNull();
    deadlineId = data!.id;
  });

  it("rejects an exam countdown missing its scores", async () => {
    const { error } = await me.client
      .from("countdowns")
      .insert({ kind: "exam", title: "No scores", target_at: inSeconds(86400) });
    expect(error?.code).toBe("23514");
  });

  it("rejects a deadline that tries to carry a score", async () => {
    const { error } = await me.client
      .from("countdowns")
      .insert({ kind: "deadline", title: "Sneaky", target_at: inSeconds(86400), target_score: 1 });
    expect(error).not.toBeNull(); // no insert grant on target_score at all
  });

  it("rejects a target above the max", async () => {
    const { error } = await me.client
      .from("countdowns")
      .insert({ kind: "exam", title: "Bad target", target_at: inSeconds(86400), target_score: 701, max_score: 700 });
    expect(error?.code).toBe("23514");
  });

  it("refuses an actual score before the deadline", async () => {
    const { error } = await me.client.from("countdowns").update({ actual_score: 600 }).eq("id", examId);
    expect(error?.message).toMatch(/after the deadline/);
  });

  it("accepts a score once the deadline has passed", async () => {
    await me.client.from("countdowns").update({ target_at: inSeconds(-60) }).eq("id", examId);
    const { error } = await me.client.from("countdowns").update({ actual_score: 641 }).eq("id", examId);
    expect(error).toBeNull();
  });

  it("kind can't be changed after creation (no grant)", async () => {
    const { error } = await me.client.from("countdowns").update({ kind: "deadline" }).eq("id", examId);
    expect(error?.code).toBe("42501");
  });

  it("is invisible to other users", async () => {
    const { data } = await other.client.from("countdowns").select("title");
    expect(data).toEqual([]);
  });

  describe("only one countdown can feed the widget", () => {
    it("starring one clears any previous choice, atomically", async () => {
      const first = await me.client.rpc("set_widget_countdown", { countdown_id: examId });
      expect(first.error).toBeNull();
      const second = await me.client.rpc("set_widget_countdown", { countdown_id: deadlineId });
      expect(second.error).toBeNull();

      const { data } = await me.client.from("countdowns").select("id, is_widget").in("id", [examId, deadlineId]);
      const starred = data!.filter((r) => r.is_widget);
      expect(starred).toEqual([{ id: deadlineId, is_widget: true }]);
    });

    it("the RPC only touches the caller's own countdowns", async () => {
      const { error } = await other.client.rpc("set_widget_countdown", { countdown_id: examId });
      expect(error).toBeNull(); // no error, but...
      const { data } = await me.client.from("countdowns").select("is_widget").eq("id", examId).single();
      expect(data!.is_widget).toBe(false); // ...it did nothing, since examId isn't other's row
    });
  });
});

describe("widget token", () => {
  it("the owner can set their own token hash, findable by hash via the service role", async () => {
    const hash = createHash("sha256").update("a-raw-token").digest("hex");
    // Not .upsert(): ON CONFLICT DO UPDATE needs full-table SELECT, which this
    // column-restricted table doesn't grant. A plain insert is enough here since `me`
    // has no row yet.
    const set = await me.client.from("widget_tokens").insert({ token_hash: hash });
    expect(set.error).toBeNull();

    const { data, error } = await admin.from("widget_tokens").select("user_id").eq("token_hash", hash).maybeSingle();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(me.id);
  });

  it("token_hash is not selectable by anyone, even the owner", async () => {
    const { error } = await me.client.from("widget_tokens").select("token_hash");
    expect(error?.code).toBe("42501");
  });

  it("a wrong hash finds nothing", async () => {
    const { data } = await admin.from("widget_tokens").select("user_id").eq("token_hash", "not-a-real-hash").maybeSingle();
    expect(data).toBeNull();
  });

  it("removing it makes it unfindable again", async () => {
    const hash = createHash("sha256").update("a-raw-token").digest("hex");
    await me.client.from("widget_tokens").delete().eq("user_id", me.id);
    const { data } = await admin.from("widget_tokens").select("user_id").eq("token_hash", hash).maybeSingle();
    expect(data).toBeNull();
  });
});
