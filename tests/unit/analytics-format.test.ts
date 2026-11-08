import { describe, expect, it } from "vitest";
import { fillDays, shares } from "@/lib/analytics-format";

describe("fillDays", () => {
  it("returns every day up to today, with zeros for missing ones", () => {
    const days = fillDays([["2026-11-07T00:00:00Z", 3], ["2026-11-05", "2"]], "2026-11-08", 4);
    expect(days).toEqual([
      { day: "2026-11-05", count: 2 },
      { day: "2026-11-06", count: 0 },
      { day: "2026-11-07", count: 3 },
      { day: "2026-11-08", count: 0 },
    ]);
  });
  it("crosses month and year boundaries", () => {
    expect(fillDays([], "2027-01-01", 3).map((d) => d.day)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });
});

describe("shares", () => {
  it("sorts by count and works out each share", () => {
    expect(shares([["Ethiopia", 3], ["Germany", 1]])).toEqual([
      { label: "Ethiopia", count: 3, share: 0.75 },
      { label: "Germany", count: 1, share: 0.25 },
    ]);
  });
  it("merges blank and missing labels into Unknown", () => {
    expect(shares([[null, 1], ["", 2], ["Kenya", 1]])).toEqual([
      { label: "Unknown", count: 3, share: 0.75 },
      { label: "Kenya", count: 1, share: 0.25 },
    ]);
  });
  it("copes with no data", () => {
    expect(shares([])).toEqual([]);
  });
});
