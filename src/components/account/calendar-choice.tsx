"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setCalendarPref } from "@/actions/preferences";
import type { CalendarPref } from "@/lib/dates";

const OPTIONS: { value: CalendarPref; label: string }[] = [
  { value: "gregorian", label: "Gregorian" },
  { value: "ethiopian", label: "Ethiopian" },
];

/** Which calendar dates are shown in: a two-way switch on /account. */
export function CalendarChoice({ current }: { current: CalendarPref }) {
  const [optimistic, setOptimistic] = useOptimistic(current);
  const [error, setError] = useState<string | null>(null);
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
    <div>
      <div role="radiogroup" aria-label="Calendar" className="flex rounded-full bg-paper-deep p-1">
        {OPTIONS.map((o) => {
          const active = optimistic === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(o.value)}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                active ? "bg-teal text-accent-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-wax">
          {error}
        </p>
      )}
    </div>
  );
}
