"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function split(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Ticks every second. `serverNow` anchors the clock to the server's time so a
 * phone with a wrong clock still counts down correctly.
 */
export function LiveCountdown({
  target,
  serverNow,
  variant = "large",
}: {
  target: string;
  serverNow: number;
  variant?: "large" | "compact";
}) {
  const router = useRouter();
  const [now, setNow] = useState(serverNow);
  const refreshed = useRef(false);
  const targetMs = new Date(target).getTime();

  useEffect(() => {
    const offset = serverNow - Date.now();
    const tick = () => setNow(Date.now() + offset);
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [serverNow]);

  const remaining = targetMs - now;

  useEffect(() => {
    if (remaining <= 0 && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [remaining, router]);

  const { days, hours, minutes, seconds } = split(remaining);
  const label = `${days} days, ${hours} hours, ${minutes} minutes to go`;

  if (variant === "compact") {
    return (
      <p className="font-display text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl" aria-label={label}>
        {days}
        <span className="text-lg text-muted">d</span> {pad(hours)}
        <span className="text-lg text-muted">h</span> {pad(minutes)}
        <span className="text-lg text-muted">m</span> {pad(seconds)}
        <span className="text-lg text-muted">s</span>
      </p>
    );
  }

  const units = [
    { value: String(days), label: days === 1 ? "day" : "days" },
    { value: pad(hours), label: "hours" },
    { value: pad(minutes), label: "minutes" },
    { value: pad(seconds), label: "seconds" },
  ];

  return (
    <div role="timer" aria-label={label}>
      <ol className="grid grid-cols-4 gap-2 sm:gap-3" aria-hidden>
        {units.map((u, i) => (
          <li key={u.label} className="card flex flex-col items-center px-1 py-4 sm:py-6">
            <span
              className={`font-display font-semibold tabular-nums leading-none tracking-tight ${
                i === 0 ? "text-accent" : ""
              } ${u.value.length > 3 ? "text-3xl sm:text-5xl" : "text-4xl sm:text-6xl"}`}
            >
              {u.value}
            </span>
            <span className="mt-2 text-xs font-semibold tracking-wider text-muted uppercase sm:text-sm">{u.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
