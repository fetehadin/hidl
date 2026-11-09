import { describe, expect, it } from "vitest";
import { addMonthKey, calendarMonth, monthKeyOf, parseMonthKey, yearMonthKeys, yearOf } from "@/lib/calendar-months";

describe("calendar months", () => {
  it("Gregorian months are unchanged", () => {
    const nov = calendarMonth("gregorian", "2026-11");
    expect(nov).toMatchObject({ label: "November 2026", short: "Nov", year: 2026, leadingBlanks: 6 });
    expect(nov.days[0]).toBe("2026-11-01");
    expect(nov.days.length).toBe(30);
    expect(monthKeyOf("gregorian", "2026-11-08")).toBe("2026-11");
    expect(yearMonthKeys("gregorian", 2026)).toHaveLength(12);
  });

  it("an Ethiopian month is its own 30 real days, numbered 1 to 30", () => {
    const tikimt = calendarMonth("ethiopian", "2019-02");
    expect(tikimt).toMatchObject({ label: "Tikimt 2019", short: "Tikimt", year: 2019 });
    expect(tikimt.days[0]).toBe("2026-10-11");
    expect(tikimt.days.at(-1)).toBe("2026-11-09");
    expect(tikimt.dayNumbers).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(tikimt.leadingBlanks).toBe(6); // October 11, 2026 is a Sunday
    expect(monthKeyOf("ethiopian", "2026-11-08")).toBe("2019-02");
    expect(monthKeyOf("ethiopian", "2026-11-10")).toBe("2019-03");
  });

  it("Pagume has 5 days, or 6 in a leap year, and a year has 13 months", () => {
    expect(calendarMonth("ethiopian", "2018-13").days).toEqual(["2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"]);
    expect(calendarMonth("ethiopian", "2019-13").days.at(-1)).toBe("2027-09-11");
    expect(calendarMonth("ethiopian", "2019-13").days).toHaveLength(6);
    expect(yearMonthKeys("ethiopian", 2019)).toHaveLength(13);
    expect(yearOf("ethiopian", "2026-09-10")).toBe(2018);
    expect(yearOf("ethiopian", "2026-09-11")).toBe(2019);
  });

  it("steps months across year ends and validates keys per calendar", () => {
    expect(addMonthKey("ethiopian", "2019-13", 1)).toBe("2020-01");
    expect(addMonthKey("ethiopian", "2019-01", -1)).toBe("2018-13");
    expect(addMonthKey("gregorian", "2026-12", 1)).toBe("2027-01");
    expect(addMonthKey("gregorian", "2026-01", -1)).toBe("2025-12");
    expect(parseMonthKey("ethiopian", "2019-13")).toBe("2019-13");
    expect(parseMonthKey("gregorian", "2026-13")).toBeUndefined();
    expect(parseMonthKey("gregorian", "nope")).toBeUndefined();
    expect(parseMonthKey("ethiopian", undefined)).toBeUndefined();
  });

  it("every day of a year belongs to exactly one of its months", () => {
    for (const year of [2018, 2019]) {
      const days = yearMonthKeys("ethiopian", year).flatMap((k) => calendarMonth("ethiopian", k).days);
      expect(new Set(days).size).toBe(days.length);
      expect(days.length).toBe(year % 4 === 3 ? 366 : 365);
      for (const d of days) expect(yearOf("ethiopian", d)).toBe(year);
    }
  });
});
