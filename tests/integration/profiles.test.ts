import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_AVATAR } from "@/lib/avatar";
import { getAvatar } from "@/lib/data/profile";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers";

let me: TestUser;
let other: TestUser;

beforeAll(async () => {
  [me, other] = await Promise.all([createTestUser(), createTestUser()]);
});
afterAll(async () => {
  await Promise.all([deleteTestUser(me), deleteTestUser(other)]);
});

describe("profiles (avatar)", () => {
  it("no row means no buddy yet", async () => {
    expect(await getAvatar(me.client)).toBeNull();
  });

  it("saves a buddy for the signed-in user and reads it back fresh", async () => {
    const avatar = { ...DEFAULT_AVATAR, theme: "berry", top: "bunny" };
    expect((await me.client.from("profiles").insert({ avatar })).error).toBeNull();
    expect(await getAvatar(me.client)).toEqual(avatar);

    const next = { ...avatar, extra: "headphones" };
    expect((await me.client.from("profiles").update({ avatar: next }).eq("user_id", me.id)).error).toBeNull();
    expect(await getAvatar(me.client)).toEqual(next);
  });

  it("is private to its owner", async () => {
    expect(await getAvatar(other.client)).toBeNull();
    const { data } = await other.client.from("profiles").select("*");
    expect(data).toEqual([]);
  });

  it("can't be written for someone else", async () => {
    const { error } = await other.client.from("profiles").insert({ user_id: me.id, avatar: DEFAULT_AVATAR });
    expect(error).not.toBeNull();
  });

  it("rejects unknown options, missing parts and extra keys", async () => {
    const bad = [
      { ...DEFAULT_AVATAR, theme: "neon" },
      { theme: "mint" },
      { ...DEFAULT_AVATAR, script: "<x>" },
      "mint",
    ];
    for (const avatar of bad) {
      const { error } = await other.client.from("profiles").insert({ avatar });
      expect(error, JSON.stringify(avatar)).not.toBeNull();
    }
  });

  it("going back to Hidi deletes the row", async () => {
    expect((await me.client.from("profiles").delete().eq("user_id", me.id)).error).toBeNull();
    expect(await getAvatar(me.client)).toBeNull();
  });
});
