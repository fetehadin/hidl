import { describe, expect, it } from "vitest";
import { addMonths, daysInMonth, leadingBlanks, monthDays } from "@/lib/calendar";
import { isoDate, photoPathPattern } from "@/lib/validation/photos";

describe("calendar helpers", () => {
  it("knows month lengths and leap years", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(monthDays("2026-10")).toHaveLength(31);
  });

  it("lays out a Monday-first grid", () => {
    expect(leadingBlanks("2026-10")).toBe(3); // Oct 1, 2026 is a Thursday
    expect(leadingBlanks("2026-06")).toBe(0); // Jun 1, 2026 is a Monday
  });

  it("moves across years", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("photo validation", () => {
  it("rejects impossible dates", () => {
    expect(isoDate.safeParse("2026-02-30").success).toBe(false);
    expect(isoDate.safeParse("2026-10-19").success).toBe(true);
  });

  it("only accepts paths in the user's folder for that day", () => {
    const re = photoPathPattern("u1", "2026-10-19");
    expect(re.test("u1/2026-10-19-0123456789abcdef.webp")).toBe(true);
    expect(re.test("u1/2026-10-19-0123456789abcdef-thumb.webp")).toBe(true);
    expect(re.test("u2/2026-10-19-0123456789abcdef.webp")).toBe(false);
    expect(re.test("u1/2026-10-18-0123456789abcdef.webp")).toBe(false);
    expect(re.test("u1/../u2/2026-10-19-0123456789abcdef.webp")).toBe(false);
  });
});
