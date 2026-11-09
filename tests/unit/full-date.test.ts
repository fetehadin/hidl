import { describe, expect, it } from "vitest";
import { formatFullDate } from "@/lib/dates";

// One calendar at a time: the full date reads in the chosen calendar only, never both.
describe("formatFullDate", () => {
  const tz = "Africa/Addis_Ababa";
  const at = "2026-12-12T14:00:00Z"; // Saturday 17:00 in Addis

  it("Gregorian", () => {
    expect(formatFullDate(at, "gregorian", tz)).toBe("Saturday, December 12, 2026");
    expect(formatFullDate(at, "gregorian", tz, { time: true })).toBe("Saturday, December 12, 2026 at 5:00 PM");
    expect(formatFullDate(at, "gregorian", tz, { year: false })).toBe("Saturday, December 12");
  });

  it("Ethiopian, with no Gregorian date mixed in", () => {
    const text = formatFullDate(at, "ethiopian", tz, { time: true });
    expect(text).toBe("Saturday, Tahsas 3, 2019 at 5:00 PM");
    expect(text).not.toMatch(/December|2026/);
    expect(formatFullDate(at, "ethiopian", tz, { year: false })).toBe("Saturday, Tahsas 3");
  });
});
