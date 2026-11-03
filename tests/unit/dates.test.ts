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
    expect(formatDay(d, "gregorian", "Africa/Addis_Ababa")).toBe("October 31, 2026");
    expect(formatDay(d, "ethiopian", "Africa/Addis_Ababa")).toBe("Tikimt 21, 2019");
    // ...but still Oct 30 in Los Angeles.
    expect(formatDay(d, "gregorian", "America/Los_Angeles")).toBe("October 30, 2026");
    expect(formatDay(d, "ethiopian", "America/Los_Angeles")).toBe("Tikimt 20, 2019");
  });
});
