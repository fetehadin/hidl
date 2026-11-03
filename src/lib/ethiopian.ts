/**
 * Gregorian <-> Ethiopian calendar conversion. Display-only: every date in the app is
 * still stored and reasoned about as a UTC instant exactly as before — this only changes
 * how a date is *shown* to the user.
 *
 * Anchored on the Ethiopian Millennium (1 Meskerem 2000 = September 11, 2007) and a plain
 * 4-year leap cycle (Ethiopian year is leap, with a 6-day Pagume, when year % 4 === 0),
 * validated against several independently-known fixed points: Ethiopian Christmas
 * (Genna, Tahsas 29) falling on January 7 across 2023/2024/2026, and Epiphany (Timkat,
 * Tir 11) on January 19, 2024. Holds for the foreseeable future — the two calendars'
 * 4-year leap cycles stay phase-locked until Gregorian's next century exception (~2100).
 *
 * An instant is converted via its calendar day in the user's time zone (matching how the
 * rest of the app treats "today"), not the raw UTC day, so a conversion near midnight
 * doesn't land on the wrong Ethiopian day. A "YYYY-MM-DD" day string (a photo's `date`)
 * already is a local day and is converted as-is, with no time zone involved.
 */
import { TZDate } from "@date-fns/tz";

const ANCHOR_GREGORIAN_UTC_MS = Date.UTC(2007, 8, 11);
const ANCHOR_ETHIOPIAN_YEAR = 2000;
const MS_PER_DAY = 86_400_000;

export const ETHIOPIAN_MONTHS = [
  "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit",
  "Megabit", "Miazia", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume",
] as const;

export type EthiopianDate = { year: number; month: number; day: number };

function isLeap(ethiopianYear: number) {
  return ((ethiopianYear % 4) + 4) % 4 === 0;
}

function yearLength(ethiopianYear: number) {
  return isLeap(ethiopianYear) ? 366 : 365;
}

const DAY_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whole calendar days since the Unix epoch, for the date's calendar day in `tz`. */
function toLocalDays(date: Date | string, tz: string) {
  const dayOnly = typeof date === "string" ? DAY_ONLY.exec(date) : null;
  if (dayOnly) return Math.round(Date.UTC(+dayOnly[1], +dayOnly[2] - 1, +dayOnly[3]) / MS_PER_DAY);
  const local = new TZDate(new Date(date), tz);
  return Math.round(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()) / MS_PER_DAY);
}

export function toEthiopian(date: Date | string, tz: string): EthiopianDate {
  let d = toLocalDays(date, tz) - ANCHOR_GREGORIAN_UTC_MS / MS_PER_DAY;
  let year = ANCHOR_ETHIOPIAN_YEAR;
  if (d >= 0) {
    while (d >= yearLength(year)) {
      d -= yearLength(year);
      year++;
    }
  } else {
    while (d < 0) {
      year--;
      d += yearLength(year);
    }
  }
  return { year, month: Math.floor(d / 30) + 1, day: (d % 30) + 1 };
}

export function fromEthiopian({ year, month, day }: EthiopianDate): Date {
  let totalDays = 0;
  if (year >= ANCHOR_ETHIOPIAN_YEAR) {
    for (let y = ANCHOR_ETHIOPIAN_YEAR; y < year; y++) totalDays += yearLength(y);
  } else {
    for (let y = year; y < ANCHOR_ETHIOPIAN_YEAR; y++) totalDays -= yearLength(y);
  }
  totalDays += (month - 1) * 30 + (day - 1);
  return new Date(ANCHOR_GREGORIAN_UTC_MS + totalDays * MS_PER_DAY);
}

/** "Tikimt 19, 2019" for an instant, on its calendar day in `tz`. */
export function formatEthiopian(date: Date | string, tz: string) {
  const { year, month, day } = toEthiopian(date, tz);
  return `${ETHIOPIAN_MONTHS[month - 1]} ${day}, ${year}`;
}

/** "Tikimt 19, 2019" for a "YYYY-MM-DD" day string (a photo's `date`): no time zone involved. */
export function formatEthiopianDay(dateISO: string) {
  if (!DAY_ONLY.test(dateISO)) throw new Error(`Not a YYYY-MM-DD day: ${dateISO}`);
  return formatEthiopian(dateISO, "UTC");
}
