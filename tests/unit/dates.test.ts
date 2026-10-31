import { describe, expect, it } from "vitest";
import { calendarPref, formatDay } from "@/lib/dates";

describe("calendar preference", () => {
  it("defaults to Gregorian for anything but 'ethiopian'", () => {
    expect(calendarPref(undefined)).toBe("gregorian");
    expect(calendarPref("nonsense")).toBe("gregorian");
    expect(calendarPref("ethiopian")).toBe("ethiopian");
  });

  it("formats a day in the chosen calendar", () => {
    // 21:00 UTC on Oct 30 is already Oct 31 in Addis Ababa.
    const d = new Date("2026-10-30T21:30:00Z");
    expect(formatDay(d, "gregorian")).toBe("October 31, 2026");
    expect(formatDay(d, "ethiopian")).toBe("Tikimt 21, 2019");
  });
});
