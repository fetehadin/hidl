import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/calendar";
import { todayISO } from "@/lib/time";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";

let me: TestUser;
let other: TestUser;

const photo = (user: TestUser, date: string) => ({
  date,
  image_path: `${user.id}/${date}-tzaaaaaaaa1.jpg`,
  thumb_path: `${user.id}/${date}-tzaaaaaaaa1-thumb.jpg`,
});

beforeAll(async () => {
  [me, other] = await Promise.all([createTestUser(), createTestUser()]);
});
afterAll(async () => {
  await Promise.all([deleteTestUser(me), deleteTestUser(other)]);
});

describe("user_settings.time_zone", () => {
  it("rejects a zone Postgres doesn't know", async () => {
    const { error } = await me.client.from("user_settings").insert({ time_zone: "Mars/Olympus_Mons" });
    expect(error?.code).toBe("23514");
  });

  it("saves the user's zone, and only for themselves", async () => {
    const { error } = await me.client.from("user_settings").insert({ time_zone: "Pacific/Kiritimati" });
    expect(error).toBeNull();

    // user_id isn't writable: it always comes from auth.uid().
    const { error: spoof } = await other.client.from("user_settings").insert({ user_id: me.id, time_zone: "UTC" });
    expect(spoof).not.toBeNull();

    const { data } = await other.client.from("user_settings").select("time_zone").eq("user_id", me.id);
    expect(data).toEqual([]);
  });

  it("judges 'no future photos' by the owner's own zone", async () => {
    // Kiritimati (UTC+14) reaches each new day first: its "today" is never behind anyone's.
    const today = todayISO("Pacific/Kiritimati");
    const { error } = await me.client.from("photos").insert(photo(me, today));
    expect(error).toBeNull();

    const tomorrow = addDays(today, 1);
    const { error: future } = await me.client.from("photos").insert(photo(me, tomorrow));
    expect(future?.message).toMatch(/future day/);
  });

  it("follows the zone when it changes", async () => {
    const { error } = await me.client.from("user_settings").update({ time_zone: "Pacific/Pago_Pago" }).eq("user_id", me.id);
    expect(error).toBeNull();
    // Pago Pago (UTC-11) is the last place to reach a day, so its tomorrow is always a future day there.
    const tomorrow = addDays(todayISO("Pacific/Pago_Pago"), 1);
    const { error: future } = await me.client.from("photos").insert(photo(me, tomorrow));
    expect(future?.message).toMatch(/future day/);
  });
});
