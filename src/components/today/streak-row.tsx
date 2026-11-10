"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { buyStreakFreeze } from "@/actions/streak";
import { UploadSheet, usePreloadPhotoTools } from "@/components/calendar/lazy";
import { WEEKDAYS } from "@/lib/calendar";
import { monthKeyOf } from "@/lib/calendar-months";
import type { CalendarPref } from "@/lib/dates";

/**
 * Today's streak, Duolingo-style: a flame with the count, then this week as seven small portrait
 * tiles. The flame lights up when today has a photo, and is grey until then. A day with a photo
 * shows it, a day a streak freeze covered shows ice, today without a photo is a dashed "+" that
 * opens the upload sheet, and other days are just their names. On phones the count sits on one
 * line above the week so the photos get the full width. Tapping the flame opens the streak sheet:
 * freezes held, and buying one with XP.
 */
export function StreakRow({
  streak,
  todayDone,
  days,
  today,
  thumbs,
  frozen,
  calendar,
  freezes,
  freezeMax,
  freezeCost,
  xpBalance,
  className = "",
}: {
  streak: number;
  todayDone: boolean;
  /** Monday to Sunday, "YYYY-MM-DD". */
  days: string[];
  today: string;
  /** Each day's cover thumbnail this week. */
  thumbs: Record<string, string>;
  /** Days this week a streak freeze covered. */
  frozen: string[];
  calendar: CalendarPref;
  freezes: number;
  freezeMax: number;
  freezeCost: number;
  xpBalance: number;
  className?: string;
}) {
  usePreloadPhotoTools({ lightbox: false });
  const [uploading, setUploading] = useState(false);
  const [sheet, setSheet] = useState(false);

  return (
    <section aria-label="Your streak" className={`card px-3.5 py-3 sm:flex sm:items-center sm:gap-5 sm:px-5 sm:py-4 ${className}`}>
      <button
        type="button"
        onClick={() => setSheet(true)}
        aria-label={`${streak}-day streak, ${freezes} streak ${freezes === 1 ? "freeze" : "freezes"}. Open streak details`}
        className="flex shrink-0 items-center gap-2 rounded-2xl text-left sm:gap-3"
      >
        <span className="relative">
          <Flame lit={todayDone} />
          {freezes > 0 && (
            <span
              aria-hidden
              className="absolute -right-1.5 -bottom-0.5 grid size-4 place-items-center rounded-full bg-ice text-[9px] font-extrabold text-snow ring-2 ring-white sm:size-5 sm:text-[10px]"
            >
              {freezes}
            </span>
          )}
        </span>
        {/* Phones: one line ("12 day streak") so the week below gets the room; wider: stacked. */}
        <span className="flex items-baseline gap-1.5 leading-none sm:block">
          <span className="block font-display text-xl font-extrabold tabular-nums text-ink sm:text-[1.7rem]">{streak}</span>
          <span className="block text-[10px] font-extrabold tracking-wider text-muted uppercase sm:mt-1">day streak</span>
        </span>
      </button>

      <ol className="mt-2.5 grid grid-cols-7 gap-1.5 sm:mt-0 sm:flex-1 sm:gap-2" aria-label="This week">
        {days.map((date, i) => {
          const label = WEEKDAYS[i];
          const thumb = thumbs[date];
          const tile = "relative block aspect-[3/4] w-full overflow-hidden rounded-xl sm:rounded-2xl";
          const name = "absolute inset-x-0 top-1 text-center text-[10px] leading-none font-extrabold sm:top-1.5 sm:text-xs";
          if (thumb) {
            return (
              <li key={date}>
                <Link href={`/calendar?m=${monthKeyOf(calendar, date)}`} aria-label={`${label}: open the calendar`} className={`${tile} bg-paper-deep ${date === today ? "animate-pop-in" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumb} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
                  <span aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-scrim/55 to-transparent" />
                  <span aria-hidden className={`${name} text-snow`}>{label}</span>
                </Link>
              </li>
            );
          }
          if (frozen.includes(date)) {
            return (
              <li key={date} aria-label={`${label}: kept by a streak freeze`}>
                <span className={`${tile} grid place-items-center bg-ice-soft text-ice ring-2 ring-ice ring-inset`}>
                  <span aria-hidden className={name}>{label}</span>
                  <SnowflakeIcon className="mt-2 size-4 sm:size-5" />
                </span>
              </li>
            );
          }
          if (date === today) {
            return (
              <li key={date}>
                <button
                  type="button"
                  onClick={() => setUploading(true)}
                  aria-label="Add today's photo"
                  className={`${tile} grid place-items-center border-2 border-dashed border-teal bg-mint text-accent transition-colors hover:bg-aqua/40`}
                >
                  <span aria-hidden className={name}>{label}</span>
                  <span aria-hidden className="mt-2 text-xl leading-none font-bold sm:text-2xl">+</span>
                </button>
              </li>
            );
          }
          return (
            <li key={date} aria-label={date < today ? `${label}: no photo` : label}>
              <span className={tile}>
                <span aria-hidden className={`${name} ${date < today ? "text-muted" : "text-muted/50"}`}>{label}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {uploading && <UploadSheet mode={{ kind: "add", date: today }} onClose={() => setUploading(false)} />}
      {sheet && (
        <StreakSheet
          streak={streak}
          lit={todayDone}
          freezes={freezes}
          freezeMax={freezeMax}
          freezeCost={freezeCost}
          xpBalance={xpBalance}
          onClose={() => setSheet(false)}
        />
      )}
    </section>
  );
}

/** The streak up close: the freezes held, and buying another with XP. */
function StreakSheet({
  streak,
  lit,
  freezes,
  freezeMax,
  freezeCost,
  xpBalance,
  onClose,
}: {
  streak: number;
  lit: boolean;
  freezes: number;
  freezeMax: number;
  freezeCost: number;
  xpBalance: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const full = freezes >= freezeMax;
  const short = xpBalance < freezeCost;

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function buy() {
    setMessage(null);
    start(async () => {
      const res = await buyStreakFreeze();
      setMessage(res.ok ? { ok: true, text: "Got it. Your streak is safer." } : { ok: false, text: res.message });
      if (res.ok) router.refresh();
    });
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="streak-sheet-title"
      className="m-auto mb-0 w-full max-w-sm rounded-t-card border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-mint/70 backdrop:backdrop-blur-[2px] sm:mb-auto sm:rounded-card"
    >
      <div className="flex flex-col items-center gap-4 p-6 pb-[max(1.5rem,var(--safe-bottom))] text-center">
        <Flame lit={lit} large />
        <h2 id="streak-sheet-title" className="font-display text-2xl font-extrabold">
          {streak}-day streak
        </h2>

        <div className="w-full rounded-2xl bg-ice-soft p-4">
          <div className="flex items-center justify-center gap-2" aria-label={`${freezes} of ${freezeMax} streak freezes`}>
            {Array.from({ length: freezeMax }, (_, i) => (
              <span
                key={i}
                aria-hidden
                className={`grid size-11 place-items-center rounded-2xl ${i < freezes ? "animate-pop-in bg-ice text-snow" : "border-2 border-dashed border-ice/60 text-ice/60"}`}
              >
                <SnowflakeIcon className="size-6" />
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold text-ink-soft">Miss a day and a freeze keeps your streak alive.</p>
        </div>

        <button type="button" onClick={buy} disabled={pending || full || short} className="btn btn-primary w-full">
          {full
            ? "Freezes full"
            : pending
              ? "Buying…"
              : short
                ? `Need ${freezeCost - xpBalance} more XP`
                : `Buy a freeze · ${freezeCost} XP`}
        </button>
        <p className="-mt-2 text-sm font-semibold text-muted tabular-nums">You have {xpBalance} XP</p>
        {message && (
          <p role={message.ok ? "status" : "alert"} className={`text-sm font-semibold ${message.ok ? "text-accent" : "text-wax"}`}>
            {message.text}
          </p>
        )}
        <button type="button" onClick={onClose} className="text-sm font-bold text-muted hover:text-ink">
          Close
        </button>
      </div>
    </dialog>
  );
}

/** The streak flame: warm and flickering once today has a photo, grey until then. */
function Flame({ lit, large = false }: { lit: boolean; large?: boolean }) {
  return (
    <svg
      viewBox="0 0 44 48"
      aria-hidden
      className={`${large ? "h-20 w-[4.5rem]" : "h-8 w-7 sm:h-11 sm:w-10"} shrink-0 ${lit ? "animate-flame drop-shadow-[0_4px_8px_color-mix(in_srgb,var(--flame)_45%,transparent)]" : "opacity-40 grayscale"}`}
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

function SnowflakeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M9 4l3 2 3-2M9 20l3-2 3 2" />
    </svg>
  );
}
