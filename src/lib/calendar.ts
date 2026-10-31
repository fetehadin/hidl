/** Pure calendar-date helpers on "YYYY-MM-DD" strings (no timezone involved). */

export function monthOf(dateISO: string) {
  return dateISO.slice(0, 7);
}

export function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthDays(month: string) {
  return Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** Blank cells before day 1 in a Monday-first grid. */
export function leadingBlanks(month: string) {
  const [y, m] = month.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
}

export function addMonths(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string, style: "long" | "short" = "long") {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: style,
    year: style === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export function dayLabel(dateISO: string) {
  return new Date(`${dateISO}T00:00:00Z`).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function addDays(dateISO: string, delta: number) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Consecutive days with at least one photo, ending today. Like any daily
 * streak, it isn't broken yet if today simply hasn't been captured: it then
 * counts back from yesterday, and `todayDone` says whether today is in.
 */
export function photoStreak(dates: Iterable<string>, today: string) {
  const set = new Set(dates);
  const todayDone = set.has(today);
  let day = todayDone ? today : addDays(today, -1);
  let count = 0;
  while (set.has(day)) {
    count++;
    day = addDays(day, -1);
  }
  return { count, todayDone };
}
