import { describe, expect, it } from "vitest";
import { AVATAR_PARTS, DEFAULT_AVATAR, isValidAvatar, parseAvatar, randomAvatar } from "@/lib/avatar";
import { avatarSchema } from "@/lib/validation/avatar";

describe("avatar", () => {
  it("falls back to the default buddy when nothing (or junk) is stored", () => {
    expect(parseAvatar(undefined)).toEqual(DEFAULT_AVATAR);
    expect(parseAvatar("berry")).toEqual(DEFAULT_AVATAR);
    expect(parseAvatar({ theme: "neon", eyes: 3 })).toEqual(DEFAULT_AVATAR);
  });

  it("keeps the valid parts and replaces only the unknown ones", () => {
    expect(parseAvatar({ theme: "berry", eyes: "laser", top: "cat" })).toEqual({
      ...DEFAULT_AVATAR,
      theme: "berry",
      top: "cat",
    });
  });

  it("random avatars are always valid, and accepted by the server schema", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 200; i++) {
      const a = randomAvatar(rand);
      expect(isValidAvatar(a)).toBe(true);
      expect(avatarSchema.safeParse(a).success).toBe(true);
    }
  });

  it("the server schema refuses unknown options and extra keys", () => {
    expect(avatarSchema.safeParse({ ...DEFAULT_AVATAR, theme: "neon" }).success).toBe(false);
    expect(avatarSchema.safeParse({ ...DEFAULT_AVATAR, script: "<x>" }).success).toBe(false);
    expect(Object.keys(AVATAR_PARTS)).toEqual(Object.keys(DEFAULT_AVATAR));
  });
});
