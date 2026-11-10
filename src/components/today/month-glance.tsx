import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { WEEKDAYS } from "@/lib/calendar";
import type { CalendarMonth } from "@/lib/calendar-months";

/**
 * This month as a small photo calendar (in the calendar the person picked): each day with a photo
 * shows it, today is ringed. The whole card opens the calendar. Shown on wide screens, where the
 * phone's week row alone would leave the page bare.
 */
export function MonthGlance({
  month,
  today,
  thumbs,
  className = "",
}: {
  month: CalendarMonth;
  today: string;
  /** Each day's cover thumbnail. */
  thumbs: Record<string, string>;
  className?: string;
}) {
  return (
    <Link
      href={`/calendar?m=${month.key}`}
      className={`card card-interactive animate-fade-up flex flex-col p-5 ${className}`}
      aria-label={`${month.label}: open the calendar`}
    >
      <span className="mb-3 flex items-center justify-between">
        <span className="eyebrow">{month.label}</span>
        <ArrowRightIcon width={16} height={16} className="text-muted" />
      </span>
      <span aria-hidden className="m-auto grid w-full max-w-[16.5rem] grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-center text-[10px] font-extrabold text-muted">
            {d[0]}
          </span>
        ))}
        {Array.from({ length: month.leadingBlanks }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {month.days.map((day, i) => {
          const thumb = thumbs[day];
          const cell = "relative grid aspect-square place-items-center overflow-hidden rounded-md text-[10px] font-bold";
          if (thumb) {
            return (
              <span key={day} className={`${cell} ${day === today ? "ring-2 ring-flame" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumb} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
              </span>
            );
          }
          if (day === today) {
            return (
              <span key={day} className={`${cell} text-accent ring-2 ring-teal`}>
                {month.dayNumbers[i]}
              </span>
            );
          }
          return (
            <span key={day} className={`${cell} ${day < today ? "bg-paper-deep text-muted" : "bg-paper-deep/40 text-muted/60"}`}>
              {month.dayNumbers[i]}
            </span>
          );
        })}
      </span>
    </Link>
  );
}
