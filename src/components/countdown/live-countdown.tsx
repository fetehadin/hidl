"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTimeZone } from "@/components/calendar-pref";
import { type CountdownUnit, timeLeft, timeLeftText, unitLabel } from "@/lib/countdown-units";

/**
 * The time left in the countdown's own units (any mix of years, months, days and hours,
 * see src/lib/countdown-units.ts), one tile per unit. `serverNow` anchors the clock to
 * the server's time so a phone with a wrong clock still counts down correctly.
 */
export function LiveCountdown({
  target,
  serverNow,
  units,
  size = "regular",
}: {
  target: string;
  serverNow: number;
  units: CountdownUnit[];
  size?: "regular" | "large";
}) {
  const router = useRouter();
  const timeZone = useTimeZone();
  const [now, setNow] = useState(serverNow);
  const refreshed = useRef(false);
  const targetMs = new Date(target).getTime();

  useEffect(() => {
    // Trust the phone's clock unless it's clearly wrong. A small gap is just a page kept in
    // the client cache for a little while (next.config.ts staleTimes), not a bad clock.
    const skew = serverNow - Date.now();
    const offset = Math.abs(skew) > 5 * 60_000 ? skew : 0;
    const tick = () => setNow(Date.now() + offset);
    tick();
    // Hours are the smallest unit shown, so a slow tick is plenty.
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [serverNow]);

  const remaining = targetMs - now;

  useEffect(() => {
    if (remaining <= 0 && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [remaining, router]);

  const parts = timeLeft(targetMs, now, units, timeZone);
  const large = size === "large";
  const n = parts.length;
  // Fewer tiles get bigger numbers; four still fit side by side on a phone.
  const numberSize = large
    ? ["text-6xl sm:text-7xl", "text-5xl sm:text-6xl", "text-4xl sm:text-5xl", "text-3xl sm:text-5xl"][n - 1]
    : ["text-5xl", "text-4xl sm:text-5xl", "text-4xl", "text-3xl"][n - 1];

  return (
    <div
      role="timer"
      aria-label={`${timeLeftText(parts)} to go`}
      className="grid gap-2 sm:gap-2.5"
      style={{
        gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
        // Each tile's ideal width, but never wider than the space it's given.
        width: `min(${n * (large ? 9 : 7.25)}rem, 100%)`,
      }}
    >
      {parts.map((p, i) => (
        <div
          key={p.unit}
          aria-hidden
          className={`cd-tile relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 px-1.5 ${
            large ? "py-4 sm:py-5" : "py-3"
          } ${i === 0 ? "cd-tile-lead border-teal/60 bg-mint" : "border-aqua bg-mint/60"}`}
        >
          {/* a soft highlight across the top, like the clay buttons */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/55 to-transparent" />
          <span
            key={p.value}
            className={`animate-fade-up relative font-display leading-none font-semibold tracking-tight tabular-nums ${
              i === 0 ? "text-heading" : "text-ink"
            } ${numberSize}`}
          >
            {p.unit === "hours" && i > 0 ? String(p.value).padStart(2, "0") : p.value}
          </span>
          <span className="relative mt-1.5 text-[11px] font-extrabold tracking-wider text-muted uppercase sm:text-xs">
            {unitLabel(p)}
          </span>
        </div>
      ))}
    </div>
  );
}
