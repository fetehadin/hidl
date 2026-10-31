/**
 * Which units a countdown shows the time left in: any non-empty mix of years, months,
 * days and hours. Postgres checks the same list (`countdown_units_ok` in
 * supabase/migrations/20261101000002_countdown_units.sql).
 */
import { TZDate } from "@date-fns/tz";
import { addMonths, addYears, differenceInMonths, differenceInYears } from "date-fns";
import { APP_TZ } from "./time";

export const COUNTDOWN_UNITS = ["years", "months", "days", "hours"] as const;
export type CountdownUnit = (typeof COUNTDOWN_UNITS)[number];

export const DEFAULT_UNITS: CountdownUnit[] = ["years", "months", "days"];

export const UNIT_LABEL: Record<CountdownUnit, { one: string; many: string }> = {
  years: { one: "year", many: "years" },
  months: { one: "month", many: "months" },
  days: { one: "day", many: "days" },
  hours: { one: "hour", many: "hours" },
};

export function isCountdownUnit(v: unknown): v is CountdownUnit {
  return typeof v === "string" && (COUNTDOWN_UNITS as readonly string[]).includes(v);
}

/** Valid units in largest-to-smallest order, without repeats; the default if none are valid. */
export function normalizeUnits(v: unknown): CountdownUnit[] {
  const list = Array.isArray(v) ? v : [];
  const picked = COUNTDOWN_UNITS.filter((u) => list.includes(u));
  return picked.length > 0 ? picked : [...DEFAULT_UNITS];
}

export type TimePart = { unit: CountdownUnit; value: number };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Splits the time from `now` to `target` into exactly these units, largest first. Years
 * and months are calendar years and months in the app's time zone (so Jan 31 → Feb 28
 * is one month), and whatever is smaller than the smallest unit is dropped, not rounded.
 */
function split(targetMs: number, nowMs: number, units: CountdownUnit[]): TimePart[] {
  const target = new TZDate(targetMs, APP_TZ);
  let cursor = new TZDate(nowMs, APP_TZ);
  return units.map((unit) => {
    let value: number;
    if (unit === "years") {
      value = Math.max(0, differenceInYears(target, cursor));
      cursor = addYears(cursor, value);
    } else if (unit === "months") {
      value = Math.max(0, differenceInMonths(target, cursor));
      cursor = addMonths(cursor, value);
    } else {
      const size = unit === "days" ? DAY : HOUR;
      value = Math.max(0, Math.floor((target.getTime() - cursor.getTime()) / size));
      cursor = new TZDate(cursor.getTime() + value * size, APP_TZ);
    }
    return { unit, value };
  });
}

/**
 * What a countdown shows: the time left in its chosen units, with leading zeros dropped
 * ("0 years 3 months" reads as "3 months"). If every chosen unit is still zero but time
 * remains (e.g. "months" only, 9 days out), it falls back to the next smaller unit that
 * isn't, so it never says "0 months" when something is still coming.
 */
export function timeLeft(target: Date | string | number, now: Date | number, units: CountdownUnit[]): TimePart[] {
  const targetMs = new Date(target).getTime();
  const nowMs = new Date(now).getTime();
  const chosen = normalizeUnits(units);
  const parts = split(targetMs, nowMs, chosen);

  if (targetMs > nowMs && parts.every((p) => p.value === 0)) {
    const finer = COUNTDOWN_UNITS.slice(COUNTDOWN_UNITS.indexOf(chosen.at(-1)!) + 1);
    for (const unit of finer) {
      const [p] = split(targetMs, nowMs, [unit]);
      if (p.value > 0) return [p];
    }
  }

  const first = parts.findIndex((p) => p.value > 0);
  return first === -1 ? parts.slice(-1) : parts.slice(first);
}

export function unitLabel(p: TimePart) {
  return p.value === 1 ? UNIT_LABEL[p.unit].one : UNIT_LABEL[p.unit].many;
}

/** "7 months, 14 days" for screen readers and plain text. */
export function timeLeftText(parts: TimePart[]) {
  return parts.map((p) => `${p.value} ${unitLabel(p)}`).join(", ");
}
