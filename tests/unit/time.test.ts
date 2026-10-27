import { describe, expect, it } from "vitest";
import { daysUntil, formatInAppTz, todayISO } from "@/lib/time";

describe("time helpers (Africa/Addis_Ababa, UTC+3)", () => {
  it("rolls over to the next local day at 21:00 UTC", () => {
    expect(todayISO(new Date("2026-10-19T20:59:00Z"))).toBe("2026-10-19");
    expect(todayISO(new Date("2026-10-19T21:00:00Z"))).toBe("2026-10-20");
  });

  it("formats UTC timestamps in local time", () => {
    expect(formatInAppTz("2027-06-01T05:30:00Z", "yyyy-MM-dd HH:mm")).toBe("2027-06-01 08:30");
  });

  it("counts calendar days in local time", () => {
    const now = new Date("2026-10-19T22:00:00Z"); // already Oct 20 locally
    expect(daysUntil("2026-10-21T06:00:00Z", now)).toBe(1);
  });
});

import { localToUtc, relativeUntil, utcToLocalInput } from "@/lib/time";

describe("local <-> UTC conversion", () => {
  it("treats wall-clock input as Addis time", () => {
    expect(localToUtc("2027-06-01T09:00").toISOString()).toBe("2027-06-01T06:00:00.000Z");
    expect(utcToLocalInput("2027-06-01T06:00:00Z")).toBe("2027-06-01T09:00");
  });

  it("phrases countdowns", () => {
    const now = new Date("2026-10-19T06:00:00Z");
    expect(relativeUntil("2026-10-19T06:20:00Z", now)).toBe("in 20 minutes");
    expect(relativeUntil("2026-10-19T11:00:00Z", now)).toBe("in 5 hours");
    expect(relativeUntil("2026-10-20T09:00:00Z", now)).toBe("tomorrow");
    expect(relativeUntil("2026-11-29T09:00:00Z", now)).toBe("in 41 days");
    expect(relativeUntil("2026-10-19T05:00:00Z", now)).toBe("now");
  });
});
