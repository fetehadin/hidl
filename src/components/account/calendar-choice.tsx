"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setCalendarPref } from "@/actions/preferences";
import { useTimeZone } from "@/components/calendar-pref";
import { type CalendarPref, formatDay } from "@/lib/dates";

const OPTIONS: { value: CalendarPref; label: string }[] = [
  { value: "gregorian", label: "Gregorian" },
  { value: "ethiopian", label: "Ethiopian" },
];

export function CalendarChoice({ current, now }: { current: CalendarPref; now: number }) {
  const [optimistic, setOptimistic] = useOptimistic(current);
  const [error, setError] = useState<string | null>(null);
  const timeZone = useTimeZone();
  const [, startTransition] = useTransition();

  function choose(value: CalendarPref) {
    if (value === optimistic) return;
    setError(null);
    startTransition(async () => {
      setOptimistic(value);
      const res = await setCalendarPref(value);
      if (!res.ok) setError(res.message);
    });
  }

  return (
    <fieldset>
      <legend className="sr-only">Calendar</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((o) => {
          const active = optimistic === o.value;
          return (
            <label
              key={o.value}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors ${
                active ? "border-teal bg-mint" : "border-line bg-white hover:bg-mint/60"
              }`}
            >
              <input
                type="radio"
                name="calendar"
                value={o.value}
                checked={active}
                onChange={() => choose(o.value)}
                className="size-5 accent-[var(--teal)]"
              />
              <span>
                <span className="block font-bold text-ink">{o.label}</span>
                <span className="block text-sm text-muted">Today is {formatDay(new Date(now), o.value, timeZone)}</span>
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-wax">
          {error}
        </p>
      )}
    </fieldset>
  );
}
