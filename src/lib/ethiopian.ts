/**
 * Gregorian <-> Ethiopian calendar conversion. Display-only: every date in the app is
 * still stored and reasoned about as a UTC instant exactly as before — this only changes
 * how a date is *shown* to the user.
 *
 * Anchored on the Ethiopian Millennium (1 Meskerem 2000 = September 12, 2007) and the 4-year
 * leap cycle: an Ethiopian year is leap, with a 6-day Pagume, when year % 4 === 3 (2011, 2015,
 * 2019 …), the year before a Gregorian leap year, which is why Enkutatash then falls on
 * September 12 (2023, 2027) instead of the 11th. Checked against known dates (tests/unit/
 * ethiopian.test.ts): Enkutatash 2016 on September 12, 2023; Timkat (Tir 11) on January 20, 2024
 * but January 19, 2025; Tahsas 29 on January 8, 2024 (Genna was kept on the 7th as Tahsas 28).
 * Holds until Gregorian's next century exception (2100).
 *
 * An instant is converted via its calendar day in the user's time zone (matching how the
 * rest of the app treats "today"), not the raw UTC day, so a conversion near midnight
 * doesn't land on the wrong Ethiopian day. A "YYYY-MM-DD" day string (a photo's `date`)
 * already is a local day and is converted as-is, with no time zone involved.
 */
import { TZDate } from "@date-fns/tz";

const ANCHOR_GREGORIAN_UTC_MS = Date.UTC(2007, 8, 12);
const ANCHOR_ETHIOPIAN_YEAR = 2000;
const MS_PER_DAY = 86_400_000;

export const ETHIOPIAN_MONTHS = [
  "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit",
  "Megabit", "Miazia", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume",
] as const;

export type EthiopianDate = { year: number; month: number; day: number };

function isLeap(ethiopianYear: number) {
  return ((ethiopianYear % 4) + 4) % 4 === 3;
}

/** Days in an Ethiopian month: 30, except Pagume (13), which has 5 (6 in a leap year). */
export function ethiopianMonthLength(year: number, month: number) {
  return month === 13 ? (isLeap(year) ? 6 : 5) : 30;
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
