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
