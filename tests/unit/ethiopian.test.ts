import { describe, expect, it } from "vitest";
import { formatEthiopian, formatEthiopianDay, fromEthiopian, toEthiopian } from "@/lib/ethiopian";
import { formatInTz } from "@/lib/time";

const ADDIS = "Africa/Addis_Ababa";

describe("Ethiopian calendar conversion", () => {
  it("matches the Ethiopian Millennium anchor", () => {
    expect(toEthiopian("2007-09-11T06:00:00Z", ADDIS)).toEqual({ year: 2000, month: 1, day: 1 });
  });

  it("matches Ethiopian Christmas (Genna, Tahsas 29) across different years", () => {
    expect(toEthiopian("2024-01-07T06:00:00Z", ADDIS)).toEqual({ year: 2016, month: 4, day: 29 });
    expect(toEthiopian("2023-01-07T06:00:00Z", ADDIS)).toEqual({ year: 2015, month: 4, day: 29 });
    expect(toEthiopian("2026-01-07T06:00:00Z", ADDIS)).toEqual({ year: 2018, month: 4, day: 29 });
  });

  it("matches Epiphany (Timkat, Tir 11)", () => {
    expect(toEthiopian("2024-01-19T06:00:00Z", ADDIS)).toEqual({ year: 2016, month: 5, day: 11 });
  });

  it("uses the Africa/Addis_Ababa calendar day, not the raw UTC day", () => {
    // 21:00 UTC on the 10th is already the 11th in Addis (UTC+3).
    expect(toEthiopian("2007-09-10T21:00:00Z", ADDIS)).toEqual({ year: 2000, month: 1, day: 1 });
    expect(toEthiopian("2007-09-10T20:00:00Z", ADDIS)).toEqual({ year: 1999, month: 13, day: 5 });
  });

  it("round-trips through fromEthiopian back to the same Addis calendar day", () => {
    for (const iso of ["2026-10-29T06:00:00Z", "1995-03-02T06:00:00Z", "2050-12-31T06:00:00Z"]) {
      const back = fromEthiopian(toEthiopian(iso, ADDIS));
      expect(formatInTz(back, "yyyy-MM-dd", ADDIS)).toBe(formatInTz(iso, "yyyy-MM-dd", ADDIS));
    }
  });

  it("uses the user's own calendar day", () => {
    // 21:00 UTC on Sep 10, 2007 is Sep 11 in Addis (1 Meskerem 2000) but still Sep 10 in New York.
    expect(toEthiopian("2007-09-10T21:00:00Z", "America/New_York")).toEqual({ year: 1999, month: 13, day: 5 });
    expect(toEthiopian("2007-09-10T21:00:00Z", ADDIS)).toEqual({ year: 2000, month: 1, day: 1 });
  });

  it("converts a YYYY-MM-DD day as-is, whatever the zone", () => {
    expect(formatEthiopianDay("2007-09-11")).toBe("Meskerem 1, 2000");
    for (const tz of [ADDIS, "America/Los_Angeles", "Pacific/Kiritimati"]) {
      expect(formatEthiopian("2024-01-07", tz)).toBe("Tahsas 29, 2016");
    }
    expect(() => formatEthiopianDay("2024-01-07T00:00:00Z")).toThrow();
  });
});
