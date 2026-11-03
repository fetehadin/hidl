import { describe, expect, it } from "vitest";
import {
  DEFAULT_TZ,
  daysUntil,
  formatInTz,
  greeting,
  isValidTimeZone,
  localToUtc,
  relativeUntil,
  resolveTimeZone,
  timeZoneCity,
  todayISO,
  utcToLocalInput,
} from "@/lib/time";

const ADDIS = "Africa/Addis_Ababa"; // UTC+3, no DST
const NEW_YORK = "America/New_York"; // UTC-5 / UTC-4 with DST
const KIRITIMATI = "Pacific/Kiritimati"; // UTC+14, the first place on Earth to reach a new day

describe("time helpers (Africa/Addis_Ababa, UTC+3)", () => {
  it("rolls over to the next local day at 21:00 UTC", () => {
    expect(todayISO(ADDIS, new Date("2026-10-19T20:59:00Z"))).toBe("2026-10-19");
    expect(todayISO(ADDIS, new Date("2026-10-19T21:00:00Z"))).toBe("2026-10-20");
  });

  it("formats UTC timestamps in local time", () => {
    expect(formatInTz("2027-06-01T05:30:00Z", "yyyy-MM-dd HH:mm", ADDIS)).toBe("2027-06-01 08:30");
  });

  it("counts calendar days in local time", () => {
    const now = new Date("2026-10-19T22:00:00Z"); // already Oct 20 locally
    expect(daysUntil("2026-10-21T06:00:00Z", ADDIS, now)).toBe(1);
  });
});

describe("other time zones", () => {
  it("gives each zone its own 'today' for the same instant", () => {
    const instant = new Date("2026-10-19T12:00:00Z");
    expect(todayISO(ADDIS, instant)).toBe("2026-10-19");
    expect(todayISO(KIRITIMATI, instant)).toBe("2026-10-20");
    expect(todayISO("Pacific/Pago_Pago", instant)).toBe("2026-10-19"); // UTC-11
    expect(todayISO(NEW_YORK, new Date("2026-10-20T03:00:00Z"))).toBe("2026-10-19");
  });

  it("follows daylight saving time", () => {
    // New York is UTC-4 in July and UTC-5 in January.
    expect(localToUtc("2027-07-01T09:00", NEW_YORK).toISOString()).toBe("2027-07-01T13:00:00.000Z");
    expect(localToUtc("2027-01-15T09:00", NEW_YORK).toISOString()).toBe("2027-01-15T14:00:00.000Z");
    expect(utcToLocalInput("2027-01-15T14:00:00Z", NEW_YORK)).toBe("2027-01-15T09:00");
  });

  it("greets by the local hour", () => {
    const instant = new Date("2026-10-19T08:00:00Z");
    expect(greeting(ADDIS, instant)).toBe("Good morning"); // 11:00
    expect(greeting("Asia/Tokyo", instant)).toBe("Good evening"); // 17:00
    expect(greeting(NEW_YORK, instant)).toBe("Up late"); // 04:00
  });
});

describe("time zone validation", () => {
  it("accepts real IANA zones and rejects anything else", () => {
    expect(isValidTimeZone("Europe/Paris")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Europe/Paris; drop table")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });

  it("falls back to the default for missing or bad values", () => {
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TZ);
    expect(resolveTimeZone("nope")).toBe(DEFAULT_TZ);
    expect(resolveTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });

  it("labels a zone by its city", () => {
    expect(timeZoneCity("Europe/Paris")).toBe("Paris");
    expect(timeZoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(timeZoneCity("UTC")).toBe("UTC");
  });
});

describe("local <-> UTC conversion", () => {
  it("treats wall-clock input as the user's time", () => {
    expect(localToUtc("2027-06-01T09:00", ADDIS).toISOString()).toBe("2027-06-01T06:00:00.000Z");
    expect(utcToLocalInput("2027-06-01T06:00:00Z", ADDIS)).toBe("2027-06-01T09:00");
  });

  it("phrases countdowns", () => {
    const now = new Date("2026-10-19T06:00:00Z");
    expect(relativeUntil("2026-10-19T06:20:00Z", ADDIS, now)).toBe("in 20 minutes");
    expect(relativeUntil("2026-10-19T11:00:00Z", ADDIS, now)).toBe("in 5 hours");
    expect(relativeUntil("2026-10-20T09:00:00Z", ADDIS, now)).toBe("tomorrow");
    expect(relativeUntil("2026-11-29T09:00:00Z", ADDIS, now)).toBe("in 41 days");
    expect(relativeUntil("2026-10-19T05:00:00Z", ADDIS, now)).toBe("now");
  });
});
