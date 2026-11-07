import { describe, expect, it } from "vitest";
import { addMonths, daysInMonth, leadingBlanks, monthDays, weekOf } from "@/lib/calendar";
import { isoDate, photoPathPattern, uploadPathsOk } from "@/lib/validation/photos";

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

  it("matches a video's file to its media type, with an image thumbnail", () => {
    const d = "2026-10-19";
    const p = (name: string) => `u1/${d}-0123456789abcdef${name}`;
    expect(uploadPathsOk("u1", d, "video", p(".mp4"), p("-thumb.webp"))).toBe(true);
    expect(uploadPathsOk("u1", d, "video", p(".mov"), p("-thumb.jpg"))).toBe(true);
    expect(uploadPathsOk("u1", d, "image", p(".webp"), p("-thumb.webp"))).toBe(true);
    expect(uploadPathsOk("u1", d, "image", p(".mp4"), p("-thumb.webp"))).toBe(false);
    expect(uploadPathsOk("u1", d, "video", p(".webp"), p("-thumb.webp"))).toBe(false);
    expect(uploadPathsOk("u1", d, "video", p(".mp4"), p("-thumb.mp4"))).toBe(false);
    expect(uploadPathsOk("u1", d, "video", p("-thumb.mp4"), p("-thumb.webp"))).toBe(false);
    expect(uploadPathsOk("u2", d, "video", p(".mp4"), p("-thumb.webp"))).toBe(false);
  });
});

describe("weekOf", () => {
  it("returns Monday to Sunday around the day", () => {
    // 2026-11-07 is a Saturday.
    expect(weekOf("2026-11-07")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  });
  it("starts on the day itself for a Monday and crosses months and years", () => {
    expect(weekOf("2026-11-02")[0]).toBe("2026-11-02");
    expect(weekOf("2027-01-01")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  });
  it("ends on the day itself for a Sunday", () => {
    expect(weekOf("2026-11-08").at(-1)).toBe("2026-11-08");
    expect(weekOf("2026-11-08")[0]).toBe("2026-11-02");
  });
});
