"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HourglassIcon } from "@/components/icons";

export type StatCountdown = { id: string; title: string; days: number };

/**
 * The dashboard's "days to go" chip. With several upcoming countdowns it cycles through
 * them (soonest first), names the one it's showing, and has dots to jump between them.
 * It pauses while hovered or focused, and doesn't auto-advance for reduced motion.
 */
export function CountdownStat({ items }: { items: StatCountdown[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = items.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 4000);
    return () => clearInterval(id);
  }, [count, paused]);

  const item = items[index % Math.max(count, 1)];

  return (
    <li
      className="clay stat-chip tint-white relative flex flex-col items-center gap-1 px-2 py-3 text-center sm:flex-row sm:gap-3 sm:px-5 sm:text-left"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="stat-icon grid size-11 shrink-0 place-items-center rounded-full bg-mint">
        <HourglassIcon width={26} height={26} className="text-teal" />
      </span>
      {item ? (
        <Link href="/countdown" className="min-w-0 rounded-control after:absolute after:inset-0 after:content-['']">
          {/* key restarts the fade so each countdown slides in */}
          <span key={item.id} className="animate-fade-up block" aria-live={paused ? "off" : "polite"}>
            <span className="block font-display text-2xl leading-none font-semibold tabular-nums sm:text-3xl">
              {item.days}
            </span>
            <span className="block text-[11px] font-extrabold tracking-wide text-muted uppercase sm:text-xs">
              {item.days === 1 ? "day to go" : "days to go"}
            </span>
            <span className="mt-0.5 line-clamp-1 block text-xs font-bold text-heading sm:text-[13px]">{item.title}</span>
          </span>
        </Link>
      ) : (
        <span>
          <span className="block font-display text-2xl leading-none font-semibold sm:text-3xl">—</span>
          <span className="block text-[11px] font-extrabold tracking-wide text-muted uppercase sm:text-xs">no countdown</span>
        </span>
      )}
      {count > 5 ? (
        // Too many for dots on a phone: a "2 / 7" pill that steps to the next one.
        <button
          type="button"
          onClick={() => setIndex((i) => (i + 1) % count)}
          aria-label="Show the next countdown"
          className="relative z-10 mt-1 rounded-full bg-mint px-2 py-0.5 text-[11px] font-extrabold text-heading tabular-nums sm:absolute sm:top-2 sm:right-2.5 sm:mt-0"
        >
          {(index % count) + 1} / {count}
        </button>
      ) : count > 1 && (
        <span className="relative z-10 mt-1 flex gap-1 sm:absolute sm:top-2.5 sm:right-3 sm:mt-0" role="group" aria-label="Countdowns">
          {items.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show ${c.title}`}
              aria-current={i === index % count ? "true" : undefined}
              className="grid size-5 place-items-center"
            >
              <span
                className={`block h-1.5 rounded-full transition-all duration-300 ${
                  i === index % count ? "w-3.5 bg-teal" : "w-1.5 bg-aqua"
                }`}
              />
            </button>
          ))}
        </span>
      )}
    </li>
  );
}
