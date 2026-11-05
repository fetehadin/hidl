import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAdminStats } from "@/lib/data/admin";
import { admin, anon, createTestUser, deleteTestUser, type TestUser } from "./helpers";

// The usage numbers used to be public (public_stats()); since ..._admin_and_feedback.sql they
// are admin-only (admin_stats()).
describe("usage stats", () => {
  let me: TestUser;
  let boss: TestUser;
  beforeAll(async () => {
    [me, boss] = await Promise.all([createTestUser(), createTestUser()]);
    const { error } = await admin.from("admins").insert({ user_id: boss.id });
    if (error) throw error;
  });
  afterAll(async () => {
    await Promise.all([deleteTestUser(me), deleteTestUser(boss)]);
  });

  it("an admin can read the totals", async () => {
    const stats = await getAdminStats(boss.client);
    expect(stats.people).toBeGreaterThan(0);
    expect(stats.daily).toHaveLength(30);
    expect(stats.daily.at(-1)!.day).toBe((await admin.rpc("app_today")).data);
    expect(stats.daily.at(-1)!.signups).toBeGreaterThanOrEqual(2);
  });

  it("signed out or not an admin, the totals are refused", async () => {
    expect((await anon().rpc("admin_stats")).error?.code).toBe("42501");
    expect((await me.client.rpc("admin_stats")).error?.code).toBe("42501");
    // The old public function is gone.
    expect((await anon().rpc("public_stats")).error).not.toBeNull();
  });

  it("record_visit counts a person once per day and their visits", async () => {
    const before = await getAdminStats(boss.client);
    await me.client.rpc("record_visit");
    await me.client.rpc("record_visit");
    const after = await getAdminStats(boss.client);
    expect(after.active_today).toBe(before.active_today + 1);
    expect(after.daily.at(-1)!.visits).toBe(before.daily.at(-1)!.visits + 2);
  });

  it("signed out, record_visit does nothing", async () => {
    const before = await getAdminStats(boss.client);
    const { error } = await anon().rpc("record_visit");
    expect(error?.code).toBe("42501");
    expect((await getAdminStats(boss.client)).daily.at(-1)!.visits).toBe(before.daily.at(-1)!.visits);
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
