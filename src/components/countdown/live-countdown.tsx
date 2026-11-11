"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTimeZone } from "@/components/calendar-pref";
import { type CountdownUnit, timeLeft, timeLeftText, unitLabel } from "@/lib/countdown-units";

/** Under this much time left, every countdown switches to hours, minutes and seconds. */
const FINAL_STRETCH_MS = 72 * 60 * 60 * 1000;

type Tile = { key: string; value: number; label: string; pad: boolean };

/** Hours, minutes and seconds left: the final stretch. */
function finalStretch(remaining: number): Tile[] {
  const s = Math.max(0, Math.floor(remaining / 1000));
  return [
    { key: "h", value: Math.floor(s / 3600), label: "hours", pad: false },
    { key: "m", value: Math.floor((s % 3600) / 60), label: "min", pad: true },
    { key: "s", value: s % 60, label: "sec", pad: true },
  ];
}

/**
 * The time left in the countdown's own units (any mix of years, months, days and hours,
 * see src/lib/countdown-units.ts), one tile per unit; in the last 72 hours, hours, minutes and
 * seconds ticking live. Each number rolls up into place when it appears or changes.
 * `serverNow` anchors the clock to the server's time so a phone with a wrong clock still counts
 * down correctly.
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
  const stretch = targetMs - now < FINAL_STRETCH_MS;

  useEffect(() => {
    // Trust the phone's clock unless it's clearly wrong. A small gap is just a page kept in
    // the client cache for a little while (next.config.ts staleTimes), not a bad clock.
    const skew = serverNow - Date.now();
    const offset = Math.abs(skew) > 5 * 60_000 ? skew : 0;
    const tick = () => setNow(Date.now() + offset);
    tick();
    // Seconds in the final stretch; otherwise hours are the smallest unit, so a slow tick is plenty.
    const id = setInterval(tick, stretch ? 1_000 : 15_000);
    return () => clearInterval(id);
  }, [serverNow, stretch]);

  const remaining = targetMs - now;

  useEffect(() => {
    if (remaining <= 0 && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [remaining, router]);

  const parts = timeLeft(targetMs, now, units, timeZone);
  const tiles: Tile[] =
    remaining > 0 && remaining < FINAL_STRETCH_MS
      ? finalStretch(remaining)
      : parts.map((p, i) => ({ key: p.unit, value: p.value, label: unitLabel(p), pad: p.unit === "hours" && i > 0 }));
  const large = size === "large";
  const n = tiles.length;
  // Fewer tiles get bigger numbers; four still fit side by side on a phone.
  const numberSize = large
    ? ["text-6xl sm:text-7xl", "text-5xl sm:text-6xl", "text-4xl sm:text-5xl", "text-3xl sm:text-5xl"][n - 1]
    : ["text-5xl", "text-4xl sm:text-5xl", "text-4xl", "text-3xl"][n - 1];

  return (
    <div
      role="timer"
      aria-label={`${timeLeftText(parts)} to go`}
      aria-live="off"
      className="grid gap-2 sm:gap-2.5"
      style={{
        gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
        // Each tile's ideal width, but never wider than the space it's given.
        width: `min(${n * (large ? 9 : 7.25)}rem, 100%)`,
      }}
    >
      {tiles.map((p, i) => (
        <div
          key={p.key}
          aria-hidden
          className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 px-1.5 ${
            large ? "py-4 sm:py-5" : "py-3"
          } ${i === 0 ? "border-teal/60 bg-mint" : "border-aqua bg-mint/60"}`}
        >
          {/* a soft highlight across the top, like the clay buttons */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/55 to-transparent" />
          <span
            key={p.value}
            // A new key per value: each changed number rolls up into place, left to right.
            style={{ animationDelay: `${i * 80}ms` }}
            className={`animate-roll-in relative font-display leading-none font-semibold tracking-tight tabular-nums text-ocean ${numberSize}`}
          >
            {p.pad ? String(p.value).padStart(2, "0") : p.value}
          </span>
          <span className="relative mt-1.5 text-[11px] font-extrabold tracking-wider text-muted uppercase sm:text-xs">
            {p.label}
          </span>
        </div>
      ))}
    </div>
  );
}
