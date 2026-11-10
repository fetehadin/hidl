import { describe, expect, it } from "vitest";
import { periodDays, periodRange, periodTitle, stepPeriod } from "@/lib/share-periods";

describe("share periods", () => {
  it("a day is just that day", () => {
    expect(periodDays("day", "2026-11-10", "gregorian")).toEqual({ days: ["2026-11-10"], dayNumbers: [10], leadingBlanks: 0 });
    expect(periodTitle("day", "2026-11-10", "gregorian")).toBe("Tuesday, November 10, 2026");
  });

  it("a week runs Monday to Sunday, across a month end", () => {
    const { days, dayNumbers } = periodDays("week", "2026-11-01", "gregorian");
    expect(days[0]).toBe("2026-10-26");
    expect(days[6]).toBe("2026-11-01");
    expect(dayNumbers).toEqual([26, 27, 28, 29, 30, 31, 1]);
    expect(periodTitle("week", "2026-11-01", "gregorian")).toBe("Oct 26, 2026 – Nov 1, 2026");
  });

  it("a Gregorian month has its days and the blanks before a Monday-first grid", () => {
    const m = periodDays("month", "2026-11-10", "gregorian");
    expect(m.days).toHaveLength(30);
    expect(m.leadingBlanks).toBe(6); // Nov 1, 2026 is a Sunday
    expect(periodRange("month", "2026-11-10", "gregorian")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodTitle("month", "2026-11-10", "gregorian")).toBe("November 2026");
  });

  it("an Ethiopian month uses its own days and numbers", () => {
    const m = periodDays("month", "2026-11-10", "ethiopian");
    expect(m.dayNumbers[0]).toBe(1);
    expect(m.days).toHaveLength(30);
    expect(m.days).toContain("2026-11-10");
    expect(periodTitle("month", "2026-11-10", "ethiopian")).toMatch(/2019$/);
  });

  it("steps a day, a week or a month at a time", () => {
    expect(stepPeriod("day", "2026-11-01", "gregorian", -1)).toBe("2026-10-31");
    expect(stepPeriod("week", "2026-11-12", "gregorian", 1)).toBe("2026-11-16");
    expect(stepPeriod("month", "2026-11-10", "gregorian", -1)).toBe("2026-10-01");
    expect(stepPeriod("month", "2026-01-15", "gregorian", -1)).toBe("2025-12-01");
  });
});
