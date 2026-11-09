/**
 * Calendar months for the photo calendar, in either calendar the person picked (Account →
 * Calendar). A month is just the real days it covers ("YYYY-MM-DD", which is how photos are
 * stored), the number shown on each, and where the first falls in a Monday-first week, so the
 * month and year views draw Gregorian and Ethiopian months the same way. Display only: a
 * photo's `date` never changes.
 *
 * Month keys are "YYYY-MM" in the chosen calendar: "2026-11" is November 2026, or, in the
 * Ethiopian calendar, "2019-02" is Tikimt 2019 (months 01–13, 13 being Pagume).
 */
import { addDays, daysInMonth, leadingBlanks as gregorianBlanks, monthLabel, monthOf } from "./calendar";
import type { CalendarPref } from "./dates";
import { ETHIOPIAN_MONTHS, ethiopianMonthLength, fromEthiopian, toEthiopian } from "./ethiopian";

export type CalendarMonth = {
  key: string;
  year: number;
  /** The real days, first to last. */
  days: string[];
  /** The number shown on each day, in the chosen calendar. */
  dayNumbers: number[];
  /** Empty cells before the first day in a Monday-first grid. */
  leadingBlanks: number;
  /** "November 2026" / "Tikimt 2019". */
  label: string;
  /** "Nov" / "Tikimt". */
  short: string;
};

const KEY = /^(\d{4})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, "0");

function weekdayBlanks(dayISO: string) {
  return (new Date(`${dayISO}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function ethiopianDay(year: number, month: number, day: number) {
  return fromEthiopian({ year, month, day }).toISOString().slice(0, 10);
}

/** The month key that contains a day. */
export function monthKeyOf(pref: CalendarPref, dayISO: string) {
  if (pref === "gregorian") return monthOf(dayISO);
  const e = toEthiopian(dayISO, "UTC");
  return `${e.year}-${pad(e.month)}`;
}

/** The year a day falls in, in the chosen calendar. */
export function yearOf(pref: CalendarPref, dayISO: string) {
  return pref === "gregorian" ? Number(dayISO.slice(0, 4)) : toEthiopian(dayISO, "UTC").year;
}

/** A month key from a URL, or undefined if it isn't one in this calendar. */
export function parseMonthKey(pref: CalendarPref, raw: unknown) {
  const m = typeof raw === "string" ? KEY.exec(raw) : null;
  if (!m) return undefined;
  const month = Number(m[2]);
  return month >= 1 && month <= (pref === "gregorian" ? 12 : 13) ? raw as string : undefined;
}

export function addMonthKey(pref: CalendarPref, key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  const perYear = pref === "gregorian" ? 12 : 13;
  const index = y * perYear + (m - 1) + delta;
  return `${Math.floor(index / perYear)}-${pad((index % perYear) + 1)}`;
}

/** Every month key of a year, in order: 12 Gregorian, 13 Ethiopian (Pagume last). */
export function yearMonthKeys(pref: CalendarPref, year: number) {
  return Array.from({ length: pref === "gregorian" ? 12 : 13 }, (_, i) => `${year}-${pad(i + 1)}`);
}

export function calendarMonth(pref: CalendarPref, key: string): CalendarMonth {
  const [year, month] = key.split("-").map(Number);
  if (pref === "gregorian") {
    const count = daysInMonth(key);
    return {
      key,
      year,
      days: Array.from({ length: count }, (_, i) => `${key}-${pad(i + 1)}`),
      dayNumbers: Array.from({ length: count }, (_, i) => i + 1),
      leadingBlanks: gregorianBlanks(key),
      label: monthLabel(key),
      short: monthLabel(key, "short"),
    };
  }
  const first = ethiopianDay(year, month, 1);
  const count = ethiopianMonthLength(year, month);
  const name = ETHIOPIAN_MONTHS[month - 1];
  return {
    key,
    year,
    days: Array.from({ length: count }, (_, i) => addDays(first, i)),
    dayNumbers: Array.from({ length: count }, (_, i) => i + 1),
    leadingBlanks: weekdayBlanks(first),
    label: `${name} ${year}`,
    short: name,
  };
}
