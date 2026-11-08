"use client";

import { useState } from "react";
import { useTimeZone } from "@/components/calendar-pref";
import {
  COUNTDOWN_UNITS,
  type CountdownUnit,
  normalizeUnits,
  timeLeft,
  UNIT_LABEL,
  unitLabel,
} from "@/lib/countdown-units";

/**
 * "Count down in": toggles for years, months, days and hours, any mix of them (at least
 * one stays on), with a preview of how the chosen date will read. Each ticked unit is
 * sent as its own `units` form value.
 */
export function UnitPicker({
  initial,
  target,
  error,
}: {
  initial: CountdownUnit[];
  /** The chosen date as a UTC instant, for the preview; null before one is picked. */
  target: Date | null;
  error?: string;
}) {
  const [units, setUnits] = useState<CountdownUnit[]>(() => normalizeUnits(initial));
  const [now] = useState(() => Date.now());
  const timeZone = useTimeZone();

  function toggle(unit: CountdownUnit) {
    setUnits((current) => {
      if (current.includes(unit)) return current.length === 1 ? current : current.filter((u) => u !== unit);
      return normalizeUnits([...current, unit]);
    });
  }

  const preview = target && target.getTime() > now ? timeLeft(target, now, units, timeZone) : null;

  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-semibold text-ink-soft">
        Count down in <span className="font-normal text-muted">· pick any mix</span>
      </legend>
      <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4">
        {COUNTDOWN_UNITS.map((unit) => {
          const on = units.includes(unit);
          const last = on && units.length === 1;
          return (
            <label
              key={unit}
              title={last ? "Keep at least one" : undefined}
              className={`relative flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-control border px-3 text-[15px] font-semibold transition-[background-color,border-color,transform] duration-150 select-none active:scale-95 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ocean ${
                on ? "border-teal bg-mint text-heading" : "border-line-strong bg-white text-ink-soft hover:border-fresh hover:text-heading"
              }`}
            >
              <input
                type="checkbox"
                name="units"
                value={unit}
                checked={on}
                onChange={() => toggle(unit)}
                aria-disabled={last || undefined}
                className="sr-only"
              />
              <span
                aria-hidden
                className={`grid size-4 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                  on ? "border-teal bg-teal" : "border-aqua"
                }`}
              >
                {on && (
                  <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="var(--accent-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m2.5 6.2 2.3 2.3 4.7-4.9" />
                  </svg>
                )}
              </span>
              <span className="truncate capitalize">{UNIT_LABEL[unit].many}</span>
            </label>
          );
        })}
      </div>

      <div className="mt-2.5 flex min-h-11 flex-wrap items-center gap-1.5 rounded-2xl bg-mint/50 px-3 py-2" aria-live="polite">
        <span className="mr-1 text-xs font-extrabold tracking-wide text-muted uppercase">Shows as</span>
        {preview ? (
          preview.map((p) => (
            <span key={p.unit} className="rounded-full border border-line bg-white px-2.5 py-1 text-sm font-semibold text-ink">
              <span className="font-display text-heading tabular-nums">{p.value}</span> {unitLabel(p)}
            </span>
          ))
        ) : (
          <span className="text-sm text-muted">
            {units.map((u) => UNIT_LABEL[u].many).join(" · ")}
            {target ? "" : " (pick a date to preview)"}
          </span>
        )}
      </div>
      {error && <p className="mt-1 text-sm text-wax">{error}</p>}
    </fieldset>
  );
}
