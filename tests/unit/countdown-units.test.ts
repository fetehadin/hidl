import { describe, expect, it } from "vitest";
import { normalizeUnits, timeLeft } from "@/lib/countdown-units";

// Noon in Addis Ababa (UTC+3) on Nov 1, 2026.
const NOW = new Date("2026-11-01T09:00:00Z");
const at = (iso: string) => new Date(iso);

describe("timeLeft", () => {
  const target = at("2027-06-15T06:00:00Z"); // Jun 15, 2027, 9:00 Addis

  it("splits into years, months and days, dropping leading zeros", () => {
    expect(timeLeft(target, NOW, ["years", "months", "days"])).toEqual([
      { unit: "months", value: 7 },
      { unit: "days", value: 13 },
    ]);
  });

  it("folds bigger units into the biggest chosen one", () => {
    expect(timeLeft(target, NOW, ["days"])).toEqual([{ unit: "days", value: 225 }]);
    expect(timeLeft(target, NOW, ["months", "days", "hours"])).toEqual([
      { unit: "months", value: 7 },
      { unit: "days", value: 13 },
      { unit: "hours", value: 21 },
    ]);
  });

  it("counts whole years", () => {
    expect(timeLeft(at("2029-03-01T09:00:00Z"), NOW, ["years", "months"])).toEqual([
      { unit: "years", value: 2 },
      { unit: "months", value: 4 },
    ]);
  });

  it("falls back to a smaller unit instead of showing all zeros", () => {
    expect(timeLeft(at("2026-11-10T09:00:00Z"), NOW, ["years", "months"])).toEqual([{ unit: "days", value: 9 }]);
    expect(timeLeft(at("2026-11-01T14:00:00Z"), NOW, ["days"])).toEqual([{ unit: "hours", value: 5 }]);
  });

  it("is zero once the date has passed", () => {
    expect(timeLeft(at("2026-10-01T09:00:00Z"), NOW, ["months", "days"])).toEqual([{ unit: "days", value: 0 }]);
  });
});

describe("normalizeUnits", () => {
  it("orders, dedupes and drops junk, defaulting when empty", () => {
    expect(normalizeUnits(["hours", "days", "days", "weeks"])).toEqual(["days", "hours"]);
    expect(normalizeUnits([])).toEqual(["years", "months", "days"]);
    expect(normalizeUnits(null)).toEqual(["years", "months", "days"]);
  });
});
