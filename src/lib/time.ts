import { TZDate } from "@date-fns/tz";
import { differenceInCalendarDays, format } from "date-fns";

/**
 * Every user sees times and "today" in their own IANA time zone (e.g. "Europe/Paris"), the one
 * their device reports. The browser sends it (TimeZoneSync → setTimeZone); it's kept in the
 * `hidl-tz` cookie for rendering and in `user_settings.time_zone` for the database's own
 * checks. The database stores instants as UTC; calendar days (`photos.date`) are the user's
 * local day. Every helper here takes the zone explicitly: there is no hidden default.
 */
export const DEFAULT_TZ = "Africa/Addis_Ababa";

/** Name of the cookie holding the user's time zone (set by the setTimeZone action). */
export const TZ_COOKIE = "hidl-tz";

/** True for a time zone the runtime understands ("Europe/Paris", "UTC", ...). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** A usable zone from an untrusted value (a cookie, a row), falling back to DEFAULT_TZ. */
export function resolveTimeZone(tz: unknown): string {
  return isValidTimeZone(tz) ? tz : DEFAULT_TZ;
}

/** "Europe/Paris" → "Paris", "America/Argentina/Buenos_Aires" → "Buenos Aires", for labels. */
export function timeZoneCity(tz: string) {
  return (tz.split("/").at(-1) ?? tz).replaceAll("_", " ");
}

export function nowInTz(tz: string, now: Date = new Date()) {
  return new TZDate(now, tz);
}

/** Today's calendar date (YYYY-MM-DD) in `tz`. */
export function todayISO(tz: string, now: Date = new Date()) {
  return format(nowInTz(tz, now), "yyyy-MM-dd");
}

/** Formats an instant in `tz`. Not for "YYYY-MM-DD" day strings: use src/lib/calendar.ts for those. */
export function formatInTz(date: Date | string, pattern: string, tz: string) {
  return format(new TZDate(new Date(date), tz), pattern);
}

/** Whole calendar days from today until `date`, both measured in `tz`. */
export function daysUntil(date: Date | string, tz: string, now: Date = new Date()) {
  return differenceInCalendarDays(new TZDate(new Date(date), tz), nowInTz(tz, now));
}

export function greeting(tz: string, now: Date = new Date()) {
  const h = nowInTz(tz, now).getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Interprets a wall-clock "YYYY-MM-DDTHH:mm" in `tz` and returns the UTC instant. */
export function localToUtc(local: string, tz: string): Date {
  const [d, t] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, day, hh, mm, 0, tz).getTime());
}

/** UTC instant → "YYYY-MM-DDTHH:mm" in `tz`, for <input type="datetime-local">. */
export function utcToLocalInput(date: Date | string, tz: string) {
  return formatInTz(date, "yyyy-MM-dd'T'HH:mm", tz);
}

/** Human "opens in …" phrase relative to now. */
export function relativeUntil(target: Date | string, tz: string, now: Date = new Date()) {
  const ms = new Date(target).getTime() - now.getTime();
  if (ms <= 0) return "now";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = daysUntil(target, tz, now);
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
