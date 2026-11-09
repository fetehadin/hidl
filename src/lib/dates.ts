/**
 * Which calendar dates are shown in. Gregorian is the default; Ethiopian is an option on
 * /account, stored in the user's auth metadata (`user_metadata.calendar`) so it follows
 * them across devices. Display only: nothing about how dates are stored changes.
 */
import { formatEthiopian } from "./ethiopian";
import { formatInTz } from "./time";

export type CalendarPref = "gregorian" | "ethiopian";

export function calendarPref(value: unknown): CalendarPref {
  return value === "ethiopian" ? "ethiopian" : "gregorian";
}

/** A day in the chosen calendar: "October 31, 2026" or "Tikimt 21, 2019". */
export function formatDay(date: Date | string, pref: CalendarPref, tz: string) {
  return pref === "ethiopian" ? formatEthiopian(date, tz) : formatInTz(date, "MMMM d, yyyy", tz);
}

/**
 * A full date in the chosen calendar only (never both): "Friday, December 12, 2026" or
 * "Friday, Tahsas 3, 2019", optionally with the time ("… at 5:00 PM"). Weekdays and times read
 * the same in both calendars.
 */
export function formatFullDate(date: Date | string, pref: CalendarPref, tz: string, opts: { time?: boolean; year?: boolean } = {}) {
  const weekday = formatInTz(date, "EEEE", tz);
  let day = formatDay(date, pref, tz);
  if (opts.year === false) day = day.replace(/, \d{4}$/, "");
  return `${weekday}, ${day}${opts.time ? ` at ${formatInTz(date, "h:mm a", tz)}` : ""}`;
}
