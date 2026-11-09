"use client";

import Link from "next/link";
import { useState } from "react";
import { UploadSheet, usePreloadPhotoTools } from "@/components/calendar/lazy";
import { WEEKDAYS } from "@/lib/calendar";
import { monthKeyOf } from "@/lib/calendar-months";
import type { CalendarPref } from "@/lib/dates";

/**
 * Today's streak, Duolingo-style: a flame with the count, then this week as seven dots. The flame
 * lights up (and bounces once) when today has a photo, and is grey until then. A day with a photo
 * shows it in its dot; today without one is a pulsing "+" that opens the upload sheet.
 */
export function StreakRow({
  streak,
  todayDone,
  days,
  today,
  thumbs,
  calendar,
}: {
  streak: number;
  todayDone: boolean;
  /** Monday to Sunday, "YYYY-MM-DD". */
  days: string[];
  today: string;
  /** Each day's cover thumbnail this week. */
  thumbs: Record<string, string>;
  calendar: CalendarPref;
}) {
  usePreloadPhotoTools({ lightbox: false });
  const [uploading, setUploading] = useState(false);

  return (
    <section aria-label="Your streak" className="card flex items-center gap-3 px-3.5 py-3 sm:gap-5 sm:px-5">
      <Flame lit={todayDone} />
      <p className="shrink-0 leading-none">
        <span className="block font-display text-[1.7rem] font-extrabold tabular-nums text-ink">{streak}</span>
        <span className="mt-1 block text-[10px] font-extrabold tracking-wider text-muted uppercase">
          day streak
        </span>
      </p>

      <ol className="ml-auto grid grid-cols-7 gap-1 sm:gap-2" aria-label="This week">
        {days.map((date, i) => {
          const label = WEEKDAYS[i];
          const thumb = thumbs[date];
          const letter = (
            <span aria-hidden className="block text-center text-[10px] leading-none font-extrabold text-muted">
              {label[0]}
            </span>
          );
          const dot = "mt-1 block size-[1.15rem] rounded-full sm:size-6";
          if (thumb) {
            return (
              <li key={date}>
                <Link href={`/calendar?m=${monthKeyOf(calendar, date)}`} aria-label={`${label}: open the calendar`}>
                  {letter}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumb}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className={`${dot} object-cover ring-2 ring-flame ring-offset-1 ring-offset-white ${date === today ? "animate-pop-in" : ""}`}
                  />
                </Link>
              </li>
            );
          }
          if (date === today) {
            return (
              <li key={date}>
                <button type="button" onClick={() => setUploading(true)} aria-label="Add today's photo" className="block">
                  {letter}
                  <span className={`${dot} relative grid place-items-center text-accent ring-2 ring-teal`}>
                    <span aria-hidden className="animate-ping-soft absolute inset-0 rounded-full ring-2 ring-teal" />
                    <span aria-hidden className="text-sm leading-none font-bold">+</span>
                  </span>
                </button>
              </li>
            );
          }
          return (
            <li key={date} aria-label={date < today ? `${label}: no photo` : label}>
              {letter}
              <span className={`${dot} ${date < today ? "bg-paper-deep" : "bg-paper-deep/50"}`} />
            </li>
          );
        })}
      </ol>
      {uploading && <UploadSheet mode={{ kind: "add", date: today }} onClose={() => setUploading(false)} />}
    </section>
  );
}

/** The streak flame: warm and flickering once today has a photo, grey until then. */
function Flame({ lit }: { lit: boolean }) {
  return (
    <svg
      viewBox="0 0 44 48"
      aria-hidden
      className={`h-11 w-10 shrink-0 ${lit ? "animate-flame drop-shadow-[0_4px_8px_color-mix(in_srgb,var(--flame)_45%,transparent)]" : "opacity-40 grayscale"}`}
    >
      <defs>
        <linearGradient id="streak-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--flame)" />
          <stop offset="1" stopColor="var(--flame-2)" />
        </linearGradient>
      </defs>
      <path d="M22 2c3 9 14 14 14 27a14 14 0 0 1-28 0c0-6 3-10 6-13 0 5 2 8 5 9-2-8 0-16 3-23z" fill="url(#streak-flame)" />
      <path d="M22 26c3 4 7 6 7 11a7 7 0 0 1-14 0c0-4 4-6 7-11z" fill="var(--snow)" opacity=".8" />
    </svg>
  );
}
