/**
 * The time left in a countdown's chosen units, worked out on the phone. A copy of timeLeft() in the
 * web app's src/lib/countdown-units.ts: change both together, or the widget and the site disagree.
 * Computing it here (from the feed's targetAt) keeps the widget right between refreshes and
 * offline, instead of showing numbers frozen at the last fetch.
 */
import { TZDate } from '@date-fns/tz';
import { addMonths, addYears, differenceInMonths, differenceInYears } from 'date-fns';
import type { Unit } from './feed';

const UNITS: Unit[] = ['years', 'months', 'days', 'hours'];
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Part = { unit: Unit; value: number };

function split(targetMs: number, nowMs: number, units: Unit[], tz: string): Part[] {
  const target = new TZDate(targetMs, tz);
  let cursor = new TZDate(nowMs, tz);
  return units.map((unit) => {
    let value: number;
    if (unit === 'years') {
      value = Math.max(0, differenceInYears(target, cursor));
      cursor = addYears(cursor, value);
    } else if (unit === 'months') {
      value = Math.max(0, differenceInMonths(target, cursor));
      cursor = addMonths(cursor, value);
    } else {
      const size = unit === 'days' ? DAY : HOUR;
      value = Math.max(0, Math.floor((target.getTime() - cursor.getTime()) / size));
      cursor = new TZDate(cursor.getTime() + value * size, tz);
    }
    return { unit, value };
  });
}

/** Leading zero units dropped; if every chosen unit is zero but time remains, the next smaller unit that isn't. */
export function timeLeft(targetAt: string, nowMs: number, units: Unit[], tz: string): Part[] {
  const targetMs = new Date(targetAt).getTime();
  const chosen = UNITS.filter((u) => units.includes(u));
  if (chosen.length === 0) chosen.push('years', 'months', 'days');
  const parts = split(targetMs, nowMs, chosen, tz);

  if (targetMs > nowMs && parts.every((p) => p.value === 0)) {
    for (const unit of UNITS.slice(UNITS.indexOf(chosen[chosen.length - 1]) + 1)) {
      const [p] = split(targetMs, nowMs, [unit], tz);
      if (p.value > 0) return [p];
    }
  }

  const first = parts.findIndex((p) => p.value > 0);
  return first === -1 ? parts.slice(-1) : parts.slice(first);
}
