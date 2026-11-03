"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type CountdownUnit, timeLeft, timeLeftText, unitLabel } from "@/lib/countdown-units";

/**
 * The time left in the countdown's own units (any mix of years, months, days and hours,
 * see src/lib/countdown-units.ts), as one line of big numbers with a small unit letter after
 * each: "225d 10h". `serverNow` anchors the clock to the server's time so a phone with a
 * wrong clock still counts down correctly.
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
  const [now, setNow] = useState(serverNow);
  const refreshed = useRef(false);
  const targetMs = new Date(target).getTime();

  useEffect(() => {
    const offset = serverNow - Date.now();
    const tick = () => setNow(Date.now() + offset);
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

  const parts = timeLeft(targetMs, now, units);
  const large = size === "large";
  const n = parts.length;
  // One line of big numbers; fewer units get bigger ones. Wraps rather than overflow on a phone.
  const numberSize = large
    ? ["text-7xl sm:text-8xl", "text-6xl sm:text-7xl", "text-5xl sm:text-6xl", "text-4xl sm:text-6xl"][n - 1]
    : ["text-6xl", "text-5xl", "text-4xl", "text-4xl"][n - 1];

  return (
    <p
      role="timer"
      aria-label={`${timeLeftText(parts)} to go`}
      className={`flex flex-wrap items-baseline gap-x-[0.28em] gap-y-1 font-display leading-none font-bold tracking-tight text-heading tabular-nums ${numberSize}`}
    >
      {parts.map((p, i) => (
        <span key={p.unit} aria-hidden className="inline-flex items-baseline">
          <span key={p.value} className="animate-fade-up">
            {i > 0 ? String(p.value).padStart(2, "0") : p.value}
          </span>
          <span className="ml-[0.04em] text-[0.4em] font-bold" title={unitLabel(p)}>
            {UNIT_SHORT[p.unit]}
          </span>
        </span>
      ))}
    </p>
  );
}

/** The letter after each number, as in "696d 00h". */
const UNIT_SHORT: Record<CountdownUnit, string> = { years: "y", months: "mo", days: "d", hours: "h" };
