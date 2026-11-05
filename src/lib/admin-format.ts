// Display helpers for the admin panel. Pure, so they're unit-tested (tests/unit/admin-format.test.ts).
import { formatDay, type CalendarPref } from "./dates";
import { formatEthiopianDay } from "./ethiopian";
import { formatInTz } from "./time";

/** An instant as "November 5, 2026 · 08:24" in the admin's zone and calendar. */
export function formatWhen(date: Date | string, pref: CalendarPref, tz: string) {
  return `${formatDay(date, pref, tz)} · ${formatInTz(date, "HH:mm", tz)}`;
}

/** A "YYYY-MM-DD" day string (no zone involved) in the admin's calendar. */
export function formatDayString(day: string, pref: CalendarPref) {
  if (pref === "ethiopian") return formatEthiopianDay(day);
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
}

/** "just now", "5 minutes ago", "3 days ago", "2 months ago". Past instants only; future → "just now". */
export function timeAgo(date: Date | string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
  const units: [number, string][] = [
    [365 * 86400, "year"],
    [30 * 86400, "month"],
    [7 * 86400, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    const n = Math.floor(s / size);
    if (n >= 1) return `${n} ${name}${n === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

/** "0 B", "980 KB", "4.2 MB", "1.3 GB" (powers of 1024, like Supabase's dashboard). */
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))} ${units[i]}`;
}

/** Whether a Supabase `banned_until` means "suspended right now". */
export function isSuspended(bannedUntil: string | null, now: number) {
  return bannedUntil !== null && new Date(bannedUntil).getTime() > now;
}

/** Human labels for audit actions; unknown ones show as stored. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "user.suspend": "Suspended an account",
  "user.suspend_failed": "Tried to suspend an account (failed)",
  "user.unsuspend": "Lifted a suspension",
  "user.delete": "Deleted an account",
  "user.delete_failed": "Tried to delete an account (failed)",
  "admin.grant": "Made someone an admin",
  "admin.revoke": "Removed someone's admin access",
  "feedback.update": "Updated feedback",
  "users.export": "Exported the user list",
};
