import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPublicStats } from "@/lib/data/stats";
import { admin, anon, createTestUser, deleteTestUser, type TestUser } from "./helpers";

describe("usage stats", () => {
  let me: TestUser;
  beforeAll(async () => {
    me = await createTestUser();
  });
  afterAll(async () => {
    await deleteTestUser(me);
  });

  it("anyone, even signed out, can read the totals", async () => {
    const stats = await getPublicStats(anon());
    expect(stats.people).toBeGreaterThan(0);
    expect(stats.daily).toHaveLength(30);
    expect(stats.daily.at(-1)!.day).toBe((await admin.rpc("app_today")).data);
  });

  it("record_visit counts a person once per day and their visits", async () => {
    const before = await getPublicStats(anon());
    await me.client.rpc("record_visit");
    await me.client.rpc("record_visit");
    const after = await getPublicStats(anon());
    expect(after.active_today).toBe(before.active_today + 1);
    expect(after.daily.at(-1)!.visits).toBe(before.daily.at(-1)!.visits + 2);
  });

  it("signed out, record_visit does nothing", async () => {
    const before = await getPublicStats(anon());
    const { error } = await anon().rpc("record_visit");
    expect(error?.code).toBe("42501");
    expect((await getPublicStats(anon())).daily.at(-1)!.visits).toBe(before.daily.at(-1)!.visits);
  });

  it("nobody can read or write usage rows directly, not even their own", async () => {
    const read = await me.client.from("usage_daily").select("*");
    expect(read.error?.code).toBe("42501");
    const write = await me.client.from("usage_daily").insert({ day: "2026-01-01", user_id: me.id, visits: 400 });
    expect(write.error?.code).toBe("42501");
    expect((await anon().from("usage_daily").select("*")).error?.code).toBe("42501");
  });

  it("deleting the account removes its usage rows", async () => {
    const extra = await createTestUser();
    await extra.client.rpc("record_visit");
    await deleteTestUser(extra);
    const { count } = await admin.from("usage_daily").select("*", { count: "exact", head: true }).eq("user_id", extra.id);
    expect(count).toBe(0);
  });
});
