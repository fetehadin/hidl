/**
 * The periods a person can share as a picture: one day, a Monday-to-Sunday week, or a month in
 * the calendar they picked (Gregorian or Ethiopian). Pure, for the share sheet and its tests.
 */
import { addDays, dayLabel, weekOf } from "./calendar";
import { addMonthKey, calendarMonth, monthKeyOf } from "./calendar-months";
import type { CalendarPref } from "./dates";
import { formatEthiopianDay, toEthiopian } from "./ethiopian";

export type SharePeriod = "day" | "week" | "month";

export type PeriodDays = {
  /** The real days, first to last ("YYYY-MM-DD"). */
  days: string[];
  /** The number to show on each day, in the chosen calendar. */
  dayNumbers: number[];
  /** Empty cells before the first day in a Monday-first grid (months only; 0 otherwise). */
  leadingBlanks: number;
};

const shortDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const dayNumber = (pref: CalendarPref, date: string) => (pref === "ethiopian" ? toEthiopian(date, "UTC").day : Number(date.slice(8)));

export function periodDays(period: SharePeriod, date: string, pref: CalendarPref): PeriodDays {
  if (period === "month") {
    const m = calendarMonth(pref, monthKeyOf(pref, date));
    return { days: m.days, dayNumbers: m.dayNumbers, leadingBlanks: m.leadingBlanks };
  }
  const days = period === "week" ? weekOf(date) : [date];
  return { days, dayNumbers: days.map((d) => dayNumber(pref, d)), leadingBlanks: 0 };
}

/** The same kind of period, `delta` steps away (a day, a week, a month). */
export function stepPeriod(period: SharePeriod, date: string, pref: CalendarPref, delta: number) {
  if (period === "day") return addDays(date, delta);
  if (period === "week") return addDays(weekOf(date)[0], delta * 7);
  return calendarMonth(pref, addMonthKey(pref, monthKeyOf(pref, date), delta)).days[0];
}

/** "Monday, November 10, 2026" · "Nov 9 – 15, 2026" · "November 2026" (or Ethiopian). */
export function periodTitle(period: SharePeriod, date: string, pref: CalendarPref) {
  const fmt = (d: string) => (pref === "ethiopian" ? formatEthiopianDay(d) : shortDay(d));
  if (period === "day") return pref === "ethiopian" ? formatEthiopianDay(date) : dayLabel(date);
  if (period === "week") {
    const [first, , , , , , last] = weekOf(date);
    if (pref === "ethiopian") return `${fmt(first)} – ${fmt(last)}`;
    // Short enough for a phone: "Nov 9 – 15, 2026", "Oct 26 – Nov 1, 2026", "Dec 28, 2026 – Jan 3, 2027".
    const md = (d: string) => shortDay(d).replace(/, \d{4}$/, "");
    if (first.slice(0, 4) !== last.slice(0, 4)) return `${fmt(first)} – ${fmt(last)}`;
    const end = first.slice(0, 7) === last.slice(0, 7) ? String(Number(last.slice(8))) : md(last);
    return `${md(first)} – ${end}, ${last.slice(0, 4)}`;
  }
  return calendarMonth(pref, monthKeyOf(pref, date)).label;
}

/** The first and last real day, for loading the period's photos. */
export function periodRange(period: SharePeriod, date: string, pref: CalendarPref) {
  const { days } = periodDays(period, date, pref);
  return { from: days[0], to: days[days.length - 1] };
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** The tag on a day's first photo in a week or month picture: "SAT 7" (the day in the chosen calendar). */
export function dayTag(date: string, pref: CalendarPref) {
  return `${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${dayNumber(pref, date)}`;
}
