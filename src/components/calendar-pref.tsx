"use client";

import { createContext, useContext, type ReactNode } from "react";
import { type CalendarPref, formatDay } from "@/lib/dates";

const Ctx = createContext<CalendarPref>("gregorian");

export function CalendarPrefProvider({ value, children }: { value: CalendarPref; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCalendarPref() {
  return useContext(Ctx);
}

/** Formats a day in the signed-in user's calendar. */
export function useFormatDay() {
  const pref = useContext(Ctx);
  return (date: Date | string) => formatDay(date, pref);
}
