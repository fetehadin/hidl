import { describe, expect, it } from "vitest";
import {
  addPatternPoint,
  checkLock,
  createLock,
  isValidPattern,
  isValidPin,
  parseLockConfig,
  patternSecret,
  pinSecret,
  shouldLock,
  waitAfterFailures,
} from "@/lib/app-lock";
import { periodBounds } from "@/lib/data/leaderboard";
import { displayNameProblem, isOwnPicturePath, normalizeDisplayName } from "@/lib/profile-rules";

describe("app lock", () => {
  it("PINs are 4 to 6 digits", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("123456")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
  });

  it("patterns join at least 4 distinct dots", () => {
    expect(isValidPattern([0, 1, 2, 5])).toBe(true);
    expect(isValidPattern([0, 1, 2])).toBe(false);
    expect(isValidPattern([0, 1, 1, 2])).toBe(false);
    expect(isValidPattern([0, 1, 2, 9])).toBe(false);
  });

  it("drawing across an unused dot picks it up, like Android", () => {
    expect(addPatternPoint([0], 2)).toEqual([0, 1, 2]);
    expect(addPatternPoint([0], 8)).toEqual([0, 4, 8]);
    expect(addPatternPoint([6], 0)).toEqual([6, 3, 0]);
    expect(addPatternPoint([1, 0], 2)).toEqual([1, 0, 2]); // 1 already used: no pick-up
    expect(addPatternPoint([0], 5)).toEqual([0, 5]); // knight's move: nothing in between
    expect(addPatternPoint([0, 4], 4)).toEqual([0, 4]); // used dots are ignored
  });

  it("checks the right secret and refuses others", async () => {
    const lock = await createLock("pin", pinSecret("2468"), 4, 60, 1000);
    expect(lock.hash).not.toContain("2468");
    expect(await checkLock(lock, pinSecret("2468"))).toBe(true);
    expect(await checkLock(lock, pinSecret("2469"))).toBe(false);
    // A pattern 2-4-6-8 isn't the PIN 2468.
    expect(await checkLock(lock, patternSecret([2, 4, 6, 8]))).toBe(false);
    // Salted: the same PIN twice gives different hashes.
    expect((await createLock("pin", pinSecret("2468"), 4, 60, 1000)).hash).not.toBe(lock.hash);
  });

  it("makes you wait after 5 wrong tries, doubling up to 15 minutes", () => {
    expect(waitAfterFailures(4)).toBe(0);
    expect(waitAfterFailures(5)).toBe(30_000);
    expect(waitAfterFailures(6)).toBe(60_000);
    expect(waitAfterFailures(20)).toBe(15 * 60_000);
  });

  it("locks on a fresh start or after the timeout", () => {
    expect(shouldLock(null, 1000, 60)).toBe(true);
    expect(shouldLock(0 + 1, 59_000, 60)).toBe(false);
    expect(shouldLock(1, 60_001, 60)).toBe(true);
    expect(shouldLock(1000, 1000, 0)).toBe(true);
  });

  it("ignores broken or foreign stored settings", () => {
    expect(parseLockConfig(null)).toBeNull();
    expect(parseLockConfig("{oops")).toBeNull();
    expect(parseLockConfig(JSON.stringify({ v: 2, kind: "pin" }))).toBeNull();
    const c = parseLockConfig(JSON.stringify({ v: 1, kind: "pattern", hash: "h", salt: "s", timeout: 7 }));
    expect(c).toMatchObject({ kind: "pattern", timeout: 60, failures: 0 });
  });
});

describe("display names", () => {
  it("normalizes spaces", () => {
    expect(normalizeDisplayName("  Nezi   W  ")).toBe("Nezi W");
  });
  it("mirrors display_name_ok()", () => {
    expect(displayNameProblem("Nezi")).toBeNull();
    expect(displayNameProblem("ሀና")).toBeNull();
    expect(displayNameProblem("A")).toMatch(/at least/);
    expect(displayNameProblem("x".repeat(25))).toMatch(/24/);
    expect(displayNameProblem("--")).toMatch(/letter or number/);
    expect(displayNameProblem("hidl team")).toMatch(/reserved/);
    expect(displayNameProblem("The Admin")).toMatch(/reserved/);
  });
  it("only accepts picture paths in your own folder", () => {
    const me = "8f0a2b1c-1111-4222-8333-444455556666";
    expect(isOwnPicturePath(`${me}/0123456789abcdef.webp`, me)).toBe(true);
    expect(isOwnPicturePath(`${me}/0123456789abcdef.png`, me)).toBe(false);
    expect(isOwnPicturePath(`other/0123456789abcdef.webp`, me)).toBe(false);
  });
});

describe("leaderboard periods", () => {
  it("weeks run Monday to Sunday", () => {
    expect(periodBounds("week", false, "2026-11-05")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    expect(periodBounds("week", true, "2026-11-05")).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(periodBounds("week", false, "2026-11-02")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    expect(periodBounds("week", false, "2026-11-08")).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });
  it("months are calendar months", () => {
    expect(periodBounds("month", false, "2026-11-05")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(periodBounds("month", true, "2026-03-31")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(periodBounds("month", true, "2027-01-10")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });
});
