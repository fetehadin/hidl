import Link from "next/link";
import { WEEKDAYS } from "@/lib/calendar";
import type { PhotoView } from "@/lib/data/photos";

/**
 * This week at a glance on Today: seven portrait tiles, Monday to Sunday. A day with a photo
 * shows it; today without one is the add button; later days are blank.
 */
export function WeekStrip({ days, today, covers }: { days: string[]; today: string; covers: Map<string, PhotoView> }) {
  const done = days.filter((d) => covers.has(d)).length;
  return (
    <section aria-label="This week" className="mb-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="eyebrow">This week</h2>
        <span className="text-xs font-semibold text-muted tabular-nums">{done}/7</span>
      </div>
      <ol className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((date, i) => {
          const photo = covers.get(date);
          const label = WEEKDAYS[i];
          const tile = "relative block aspect-[3/4] overflow-hidden rounded-[9px] sm:aspect-[4/3] sm:rounded-control";
          const tag = "absolute top-1 left-1.5 text-[11px] leading-none font-bold sm:top-1.5 sm:left-2 sm:text-xs";
          if (photo) {
            return (
              <li key={date}>
                <Link href={`/calendar?m=${date.slice(0, 7)}`} className={`${tile} bg-paper-deep`} aria-label={`${label}: open the calendar`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.thumbUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  <span aria-hidden className="absolute inset-x-0 top-0 h-7 bg-gradient-to-b from-scrim/45 to-transparent" />
                  <span className={`${tag} text-snow [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]`}>{label}</span>
                </Link>
              </li>
            );
          }
          if (date === today) {
            return (
              <li key={date}>
                <Link
                  href="/calendar?add=today"
                  className={`${tile} border-2 border-dashed border-accent bg-accent-soft text-accent`}
                  aria-label="Add today's photo"
                >
                  <span className={tag}>{label}</span>
                  <span aria-hidden className="absolute inset-0 grid place-items-center text-2xl font-semibold">+</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={date} className={`${tile} ${date < today ? "bg-paper-deep text-muted" : "text-muted/50"}`}>
              <span className={tag}>{label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
