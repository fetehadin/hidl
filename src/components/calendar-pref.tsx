"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { setTimeZone } from "@/actions/preferences";
import { type CalendarPref, formatDay } from "@/lib/dates";
import { DEFAULT_TZ, isValidTimeZone } from "@/lib/time";

const Ctx = createContext<CalendarPref>("gregorian");
const TzCtx = createContext<string>(DEFAULT_TZ);

/**
 * The signed-in user's display preferences: their calendar and their time zone. Both come from
 * the server (requireUser) so server and client render the same dates.
 */
export function CalendarPrefProvider({ value, timeZone, children }: { value: CalendarPref; timeZone: string; children: ReactNode }) {
  return (
    <Ctx.Provider value={value}>
      <TzCtx.Provider value={timeZone}>
        <TimeZoneSync current={timeZone} />
        {children}
      </TzCtx.Provider>
    </Ctx.Provider>
  );
}

/**
 * Keeps the user's time zone matched to this device's, like any global app: on first visit,
 * after travelling, or after a daylight-saving rule change on the device. When they differ it
 * saves the device's zone (cookie + user_settings) and re-renders with it.
 */
function TimeZoneSync({ current }: { current: string }) {
  const router = useRouter();
  useEffect(() => {
    let device: string | undefined;
    try {
      device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!isValidTimeZone(device) || device === current) return;
    let cancelled = false;
    setTimeZone(device).then((res) => {
      if (res.ok && !cancelled) router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [current, router]);
  return null;
}

export function useCalendarPref() {
  return useContext(Ctx);
}

/** The signed-in user's IANA time zone, e.g. "Europe/Paris". */
export function useTimeZone() {
  return useContext(TzCtx);
}

/** Formats a day in the signed-in user's calendar and time zone. */
export function useFormatDay() {
  const pref = useContext(Ctx);
  const tz = useContext(TzCtx);
  return (date: Date | string) => formatDay(date, pref, tz);
}
