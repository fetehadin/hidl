import { describe, expect, it } from "vitest";
import { fromEthiopian, toEthiopian } from "@/lib/ethiopian";
import { formatInAppTz } from "@/lib/time";

describe("Ethiopian calendar conversion", () => {
  it("matches the Ethiopian Millennium anchor", () => {
    expect(toEthiopian("2007-09-11T06:00:00Z")).toEqual({ year: 2000, month: 1, day: 1 });
  });

  it("matches Ethiopian Christmas (Genna, Tahsas 29) across different years", () => {
    expect(toEthiopian("2024-01-07T06:00:00Z")).toEqual({ year: 2016, month: 4, day: 29 });
    expect(toEthiopian("2023-01-07T06:00:00Z")).toEqual({ year: 2015, month: 4, day: 29 });
    expect(toEthiopian("2026-01-07T06:00:00Z")).toEqual({ year: 2018, month: 4, day: 29 });
  });

  it("matches Epiphany (Timkat, Tir 11)", () => {
    expect(toEthiopian("2024-01-19T06:00:00Z")).toEqual({ year: 2016, month: 5, day: 11 });
  });

  it("uses the Africa/Addis_Ababa calendar day, not the raw UTC day", () => {
    // 21:00 UTC on the 10th is already the 11th in Addis (UTC+3).
    expect(toEthiopian("2007-09-10T21:00:00Z")).toEqual({ year: 2000, month: 1, day: 1 });
    expect(toEthiopian("2007-09-10T20:00:00Z")).toEqual({ year: 1999, month: 13, day: 5 });
  });

  it("round-trips through fromEthiopian back to the same Addis calendar day", () => {
    for (const iso of ["2026-10-29T06:00:00Z", "1995-03-02T06:00:00Z", "2050-12-31T06:00:00Z"]) {
      const back = fromEthiopian(toEthiopian(iso));
      expect(formatInAppTz(back, "yyyy-MM-dd")).toBe(formatInAppTz(iso, "yyyy-MM-dd"));
    }
  });
});
