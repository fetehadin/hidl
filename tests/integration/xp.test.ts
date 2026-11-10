import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "@/lib/calendar";
import { todayISO } from "@/lib/time";
import { FREEZE_COST, FREEZE_MAX } from "@/lib/xp";
import { admin, createTestUser, deleteTestUser, type TestUser } from "./helpers";

// ..._xp_and_streak_freezes.sql: XP from what people do, the XP leaderboard, and streak freezes.
// Test users have no time zone row, so their days are Addis Ababa days.

const TZ = "Africa/Addis_Ababa";
let n = 0;

/** A photo for `date`, added now (so on time only if `date` is today). */
async function photo(u: TestUser, date: string) {
  const id = (++n).toString(16).padStart(16, "0");
  const { data, error } = await u.client
    .from("photos")
    .insert({ date, image_path: `${u.id}/${date}-${id}.jpg`, thumb_path: `${u.id}/${date}-${id}-thumb.jpg` })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** A photo that looks added at noon on its own day: on time. */
async function onTime(u: TestUser, date: string) {
  const id = await photo(u, date);
  const fix = await admin.from("photos").update({ created_at: `${date}T09:00:00Z` }).eq("id", id);
  if (fix.error) throw fix.error;
  return id;
}

async function xpOn(u: TestUser, day: string) {
  const { data, error } = await admin.rpc("xp_by_day", { p_from: day, p_to: day, p_user: u.id });
  if (error) throw error;
  return ((data ?? []) as { xp: number }[]).reduce((s, r) => s + r.xp, 0);
}

async function streakState(u: TestUser) {
  const { data, error } = await u.client.rpc("my_streak");
  if (error) throw error;
  return data as { xp_balance: number; freezes: number; used_now: number; frozen_days: string[] };
}

describe("XP", () => {
  let a: TestUser;
  const today = todayISO(TZ);
  beforeEach(async () => {
    a = await createTestUser();
  });
  afterEach(async () => {
    await deleteTestUser(a);
  });

  it("a photo on its day: 10, extras +2 each up to 3, plus the streak bonus", async () => {
    await photo(a, today);
    expect(await xpOn(a, today)).toBe(10 + 1); // 1-day streak
    for (let i = 0; i < 5; i++) await photo(a, today);
    expect(await xpOn(a, today)).toBe(10 + 2 * 3 + 1);
  });

  it("the streak bonus grows with the streak, up to 10", async () => {
    for (let back = 11; back >= 0; back--) await onTime(a, addDays(today, -back));
    expect(await xpOn(a, addDays(today, -11))).toBe(10 + 1);
    expect(await xpOn(a, addDays(today, -9))).toBe(10 + 3);
    expect(await xpOn(a, today)).toBe(10 + 10); // a 12-day streak still earns 10
  });

  it("filling in an old day earns nothing", async () => {
    const yesterday = addDays(today, -1);
    await photo(a, yesterday); // added today, for yesterday
    expect(await xpOn(a, yesterday)).toBe(0);
    expect(await xpOn(a, today)).toBe(0);
  });

  it("a letter: 15 once a day; a countdown: 5 once a day", async () => {
    const letter = { title: "Hi", recipient: "Me", body: "x".repeat(10), unlock_at: new Date(Date.now() + 86_400_000 * 30).toISOString() };
    for (let i = 0; i < 2; i++) expect((await a.client.from("letters").insert(letter)).error).toBeNull();
    expect(await xpOn(a, today)).toBe(15);
    const countdown = { kind: "trip", title: "Trip", target_at: new Date(Date.now() + 86_400_000 * 10).toISOString(), details: {} };
    for (let i = 0; i < 2; i++) expect((await a.client.from("countdowns").insert(countdown)).error).toBeNull();
    expect(await xpOn(a, today)).toBe(15 + 5);
  });

  it("deleting a photo takes its XP away", async () => {
    const id = await photo(a, today);
    expect(await xpOn(a, today)).toBe(11);
    await a.client.from("photos").delete().eq("id", id);
    expect(await xpOn(a, today)).toBe(0);
  });

  it("people can't read the freeze table or the XP function directly", async () => {
    expect((await a.client.from("streak_freezes").select("*")).error?.code).toBe("42501");
    expect((await a.client.rpc("xp_by_day", { p_from: today, p_to: today })).error).not.toBeNull();
  });
});

describe("streak freezes", () => {
  let a: TestUser;
  const today = todayISO(TZ);
  beforeEach(async () => {
    a = await createTestUser();
  });
  afterEach(async () => {
    await deleteTestUser(a);
  });

  /** Three on-time days with 5 photos each: (10+6+1) + (10+6+2) + (10+6+3) = 54 XP. */
  async function earn54() {
    for (const back of [6, 5, 4]) for (let i = 0; i < 5; i++) await onTime(a, addDays(today, -back));
  }

  it("cost 50 XP, and you can hold 2", async () => {
    expect((await a.client.rpc("buy_streak_freeze")).error?.code).toBe("HX001"); // no XP yet
    await earn54();
    expect((await streakState(a)).xp_balance).toBe(54);
    expect((await a.client.rpc("buy_streak_freeze")).error).toBeNull();
    const after = await streakState(a);
    expect(after.xp_balance).toBe(4);
    expect(after.freezes).toBe(1);
    expect((await a.client.rpc("buy_streak_freeze")).error?.code).toBe("HX001"); // 4 XP left

    // With enough XP, a third is refused.
    await admin.from("streak_freezes").insert({ user_id: a.id, cost: 0 });
    expect((await a.client.rpc("buy_streak_freeze")).error?.code).toBe("HX002");
  });

  it("a missed day uses one freeze and keeps the streak", async () => {
    await photo(a, addDays(today, -3));
    await photo(a, addDays(today, -2));
    await admin.from("streak_freezes").insert({ user_id: a.id, cost: 0 }); // one freeze, yesterday missed
    const s = await streakState(a);
    expect(s.used_now).toBe(1);
    expect(s.freezes).toBe(0);
    expect(s.frozen_days).toEqual([addDays(today, -1)]);
    // Calling again changes nothing.
    expect((await streakState(a)).used_now).toBe(0);
  });

  it("a gap longer than the freezes held uses none", async () => {
    await photo(a, addDays(today, -4)); // days -3, -2, -1 missed: three freezes needed
    await admin.from("streak_freezes").insert([{ user_id: a.id, cost: 0 }, { user_id: a.id, cost: 0 }]);
    const s = await streakState(a);
    expect(s.used_now).toBe(0);
    expect(s.freezes).toBe(2);
  });

  it("the app's price and limit match the database's", async () => {
    expect((await a.client.rpc("xp_freeze_cost")).data).toBe(FREEZE_COST);
    expect((await a.client.rpc("xp_freeze_max")).data).toBe(FREEZE_MAX);
  });

  it("a frozen day carries the streak bonus on", async () => {
    await onTime(a, addDays(today, -2));
    await admin.from("streak_freezes").insert({ user_id: a.id, cost: 0, used_on: addDays(today, -1) });
    await photo(a, today);
    expect(await xpOn(a, today)).toBe(10 + 3); // -2, frozen -1, today: a 3-day streak
  });
});

describe("XP leaderboard", () => {
  let a: TestUser;
  let b: TestUser;
  beforeEach(async () => {
    [a, b] = await Promise.all([createTestUser(), createTestUser()]);
  });
  afterEach(async () => {
    await Promise.all([deleteTestUser(a), deleteTestUser(b)]);
  });

  it("ranks by XP, and a letter alone gets you on the board", async () => {
    const today = todayISO(TZ);
    await photo(a, today);
    const letter = { title: "Hi", recipient: "Me", body: "x".repeat(10), unlock_at: new Date(Date.now() + 86_400_000 * 30).toISOString() };
    expect((await b.client.from("letters").insert(letter)).error).toBeNull();
    const { data, error } = await a.client.rpc("leaderboard", { p_period: "week" });
    expect(error).toBeNull();
    const rows = data as { xp: number; is_me: boolean; streak: number; rank: number }[];
    const mine = rows.find((r) => r.is_me)!;
    expect(mine.xp).toBe(11);
    expect(mine.streak).toBe(1);
    expect(rows.some((r) => !r.is_me && r.xp === 15 && r.streak === 0)).toBe(true);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["avatar", "display_name", "is_me", "period_end", "period_start", "photo_days", "rank", "streak", "xp"],
    );
  });
});
