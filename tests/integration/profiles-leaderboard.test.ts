import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getLeaderboard } from "@/lib/data/leaderboard";
import { todayISO } from "@/lib/time";
import { admin, anon, createTestUser, deleteTestUser, type TestUser } from "./helpers";

// ..._profiles_leaderboard.sql: display names and the photo-streak leaderboard.

const tag = randomUUID().slice(0, 6);
const photo = (u: TestUser, date: string, n = 1) => ({
  date,
  image_path: `${u.id}/${date}-bbbbbbbbbb${n}.jpg`,
  thumb_path: `${u.id}/${date}-bbbbbbbbbb${n}-thumb.jpg`,
});

/** Adds a photo for `date` and makes it look uploaded at noon that day (Addis), i.e. on time. */
async function onTime(u: TestUser, date: string) {
  const { data, error } = await u.client.from("photos").insert(photo(u, date)).select("id").single();
  if (error) throw error;
  const fix = await admin.from("photos").update({ created_at: `${date}T09:00:00Z` }).eq("id", data.id);
  if (fix.error) throw fix.error;
}
/** A photo for an old day added now: a backfill. */
async function backfill(u: TestUser, date: string) {
  const { error } = await u.client.from("photos").insert(photo(u, date, 2));
  if (error) throw error;
}

describe("profiles", () => {
  let a: TestUser;
  let b: TestUser;
  beforeAll(async () => {
    [a, b] = await Promise.all([createTestUser(), createTestUser()]);
  });
  afterAll(async () => {
    await Promise.all([deleteTestUser(a), deleteTestUser(b)]);
  });

  it("a profile can hold just a name (no buddy)", async () => {
    const { error } = await a.client.from("profiles").insert({ display_name: `Abebe ${tag}` });
    expect(error).toBeNull();
    const { data } = await a.client.from("profiles").select("avatar, display_name, show_on_leaderboard").single();
    expect(data).toEqual({ avatar: null, display_name: `Abebe ${tag}`, show_on_leaderboard: true });
  });

  it("names are unique ignoring case, and checked", async () => {
    expect((await b.client.from("profiles").insert({ display_name: `ABEBE ${tag}` })).error?.code).toBe("23505");
    expect((await b.client.from("profiles").insert({ display_name: "hidl official" })).error?.code).toBe("23514");
    expect((await b.client.from("profiles").insert({ display_name: " padded " })).error?.code).toBe("23514");
    expect((await b.client.from("profiles").insert({ display_name: "x" })).error?.code).toBe("23514");
    expect((await b.client.rpc("display_name_available", { p_name: `abebe ${tag}` })).data).toBe(false);
    expect((await a.client.rpc("display_name_available", { p_name: `abebe ${tag}` })).data).toBe(true); // their own
    expect((await b.client.rpc("display_name_available", { p_name: `Free ${tag}` })).data).toBe(true);
  });

  it("nobody reads anyone else's profile row", async () => {
    await b.client.from("profiles").insert({ display_name: `Bethi ${tag}` });
    const { data } = await b.client.from("profiles").select("display_name");
    expect(data).toEqual([{ display_name: `Bethi ${tag}` }]);
    expect((await anon().from("profiles").select("*")).error?.code).toBe("42501");
  });

  it("profiles have no picture any more", async () => {
    const res = await a.client.from("profiles").update({ picture_path: `${a.id}/0123456789abcdef.webp` } as never).eq("user_id", a.id);
    expect(res.error).not.toBeNull();
  });

  it("resetting the buddy keeps the name", async () => {
    await a.client.from("profiles").update({ avatar: null }).eq("user_id", a.id);
    expect((await a.client.from("profiles").select("display_name").single()).data?.display_name).toBe(`Abebe ${tag}`);
  });
});

describe("leaderboard", () => {
  let me: TestUser;
  let hidden: TestUser;
  let third: TestUser;
  beforeAll(async () => {
    [me, hidden, third] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
    await me.client.from("profiles").insert({ display_name: `Me ${tag}` });
    await hidden.client.from("profiles").insert({ display_name: `Hidden ${tag}`, show_on_leaderboard: false });
    await third.client.from("profiles").insert({ display_name: `Third ${tag}` });
  });
  afterAll(async () => {
    await Promise.all([deleteTestUser(me), deleteTestUser(hidden), deleteTestUser(third)]);
  });

  it("scores the longest run of on-time photo days; backfills and opted-out people don't count", async () => {
    // A quiet week long ago, so nothing else in the database lands in it.
    for (const d of ["2025-02-03", "2025-02-04", "2025-02-05", "2025-02-07"]) await onTime(me, d);
    await backfill(me, "2025-02-06"); // would make a 5-day run if backfills counted
    for (const d of ["2025-02-03", "2025-02-04", "2025-02-05", "2025-02-06", "2025-02-07"]) await onTime(hidden, d);
    await onTime(third, "2025-02-09");

    const { data, error } = await admin.rpc("leaderboard_compute", { p_start: "2025-02-03", p_end: "2025-02-09" });
    expect(error).toBeNull();
    const rows = data as { user_id: string; rank: number; streak: number; photo_days: number }[];
    expect(rows.find((r) => r.user_id === me.id)).toMatchObject({ rank: 1, streak: 3, photo_days: 4 });
    expect(rows.find((r) => r.user_id === third.id)).toMatchObject({ rank: 2, streak: 1, photo_days: 1 });
    expect(rows.find((r) => r.user_id === hidden.id)).toBeUndefined();
  });

  it("the internal scoring function isn't callable from the app", async () => {
    const { error } = await me.client.rpc("leaderboard_compute", { p_start: "2025-02-03", p_end: "2025-02-09" });
    expect(error?.code).toBe("42501");
  });

  it("this week's board shows names and buddies, never ids or emails, and marks you", async () => {
    await me.client.from("photos").insert(photo(me, todayISO("Africa/Addis_Ababa"), 3));
    const board = await getLeaderboard(me.client, "week");
    const mine = board.rows.find((r) => r.isMe);
    expect(mine).toMatchObject({ displayName: `Me ${tag}`, streak: expect.any(Number) });
    expect(mine!.streak).toBeGreaterThanOrEqual(1);
    expect(board.rows.some((r) => r.displayName === `Hidden ${tag}`)).toBe(false);
    const raw = await me.client.rpc("leaderboard", { p_period: "week" });
    expect(Object.keys((raw.data as object[])[0]).sort()).toEqual(
      ["avatar", "display_name", "is_me", "period_end", "period_start", "photo_days", "rank", "streak", "xp"],
    );
  });

  it("signed out, or a bad period, is refused", async () => {
    expect((await anon().rpc("leaderboard", { p_period: "week" })).error?.code).toBe("42501");
    expect((await me.client.rpc("leaderboard", { p_period: "year" })).error?.code).toBe("22023");
  });

  it("last period's results are released once and then stay put", async () => {
    const first = await getLeaderboard(me.client, "month", true);
    const again = await getLeaderboard(third.client, "month", true);
    expect(again.start).toBe(first.start);
    expect(again.rows.map((r) => [r.rank, r.streak])).toEqual(first.rows.map((r) => [r.rank, r.streak]));
    const { count } = await admin.from("leaderboard_releases").select("*", { count: "exact", head: true }).eq("period", "month").eq("period_start", first.start);
    expect(count).toBe(1);
    expect((await me.client.from("leaderboard_results").select("*")).error?.code).toBe("42501");
  });
});
