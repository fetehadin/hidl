import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays, format } from "date-fns";

/** All display happens in this zone; the database stores UTC. */
export const APP_TZ = "Africa/Addis_Ababa";

export function nowInAppTz(now: Date = new Date()) {
  return new TZDate(now, APP_TZ);
}

/** Today's calendar date (YYYY-MM-DD) in the app timezone. */
export function todayISO(now: Date = new Date()) {
  return format(nowInAppTz(now), "yyyy-MM-dd");
}

export function formatInAppTz(date: Date | string, pattern: string) {
  return format(new TZDate(new Date(date), APP_TZ), pattern);
}

/** Whole calendar days from today until `date`, both measured in the app timezone. */
export function daysUntil(date: Date | string, now: Date = new Date()) {
  return differenceInCalendarDays(new TZDate(new Date(date), APP_TZ), nowInAppTz(now));
}

export function greeting(now: Date = new Date()) {
  const h = nowInAppTz(now).getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Interprets a wall-clock "YYYY-MM-DDTHH:mm" in the app timezone and returns the UTC instant. */
export function localToUtc(local: string): Date {
  const [d, t] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, day, hh, mm, 0, APP_TZ).getTime());
}

/** UTC instant → "YYYY-MM-DDTHH:mm" in the app timezone, for <input type="datetime-local">. */
export function utcToLocalInput(date: Date | string) {
  return formatInAppTz(date, "yyyy-MM-dd'T'HH:mm");
}

/** Human "opens in …" phrase relative to now. */
export function relativeUntil(target: Date | string, now: Date = new Date()) {
  const ms = new Date(target).getTime() - now.getTime();
  if (ms <= 0) return "now";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = daysUntil(target, now);
  if (days === 1) return "tomorrow";
  if (days < 60) return `in ${days} days`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `in ${months} months`;
  return `in ${Math.round(days / 365.25)} years`;
}

/**
 * Request time for server components (which render once per request).
 * Client components should keep time in state instead.
 */
export function requestNow() {
  return Date.now();
}
