import type { Metadata } from "next";
import Link from "next/link";
import { MonthGrid } from "@/components/calendar/month-grid";
import { ShareMonthButton } from "@/components/calendar/share-month-button";
import { addMonthKey, calendarMonth, monthKeyOf, parseMonthKey } from "@/lib/calendar-months";
import { listPhotos, signPhotos } from "@/lib/data/photos";
import { requireUser } from "@/lib/supabase/server";
import { todayISO } from "@/lib/time";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const { m, add } = await searchParams;
  // Months follow the calendar picked on Account: Gregorian, or Ethiopian (Meskerem … Pagume).
  const { supabase, user, timeZone, calendar } = await requireUser();
  const today = todayISO(timeZone);
  const currentKey = monthKeyOf(calendar, today);
  const requested = parseMonthKey(calendar, m);
  const month = calendarMonth(calendar, requested && requested <= currentKey ? requested : currentKey);

  const photos = await signPhotos(supabase, user.id, await listPhotos(supabase, month.days[0], month.days[month.days.length - 1]));

  const prev = calendarMonth(calendar, addMonthKey(calendar, month.key, -1));
  const next = calendarMonth(calendar, addMonthKey(calendar, month.key, 1));
  const isCurrent = month.key === currentKey;
  const rows = Math.ceil((month.leadingBlanks + month.days.length) / 7);

  return (
    // Tablets: the month narrows so its cells stay portrait (about 4:5), like photos. Computers:
    // cells get wider than tall (about 6:5) so pinned photos show bigger, up to 72rem, centered.
    <div
      className="@container -mx-3 -mb-[6.5rem] sm:mx-auto sm:-mb-[5.5rem] sm:max-w-[calc((100dvh-16.5rem)/var(--rows)*7*0.8)] lg:max-w-[min(72rem,calc((100dvh-16.5rem)/var(--rows)*7*1.2))]"
      style={{ "--rows": rows } as React.CSSProperties}
    >
      {/* One short row, so the month itself gets the room. Phones show chevrons only. */}
      <div className="mb-2 flex items-center justify-between gap-3 px-3 pt-1 sm:mb-3 sm:px-0 sm:pt-2">
        <h1 className="font-title text-[1.6rem] leading-tight font-medium tracking-tight whitespace-nowrap sm:text-4xl">{month.label}</h1>
        <nav aria-label="Months" className="flex items-center gap-1.5 sm:gap-2">
          <Link href={`/calendar?m=${prev.key}`} className="btn btn-ghost min-h-9 px-2.5 text-sm sm:min-h-10 sm:px-3 sm:text-base" aria-label={`Previous month, ${prev.label}`}>
            ‹<span className="hidden sm:inline"> {prev.short}</span>
          </Link>
          {isCurrent ? (
            <button type="button" disabled aria-label="No next month yet" className="btn btn-ghost min-h-9 px-2.5 text-sm sm:min-h-10 sm:px-3 sm:text-base">
              <span className="hidden sm:inline">{next.short} </span>›
            </button>
          ) : (
            <Link href={`/calendar?m=${next.key}`} className="btn btn-ghost min-h-9 px-2.5 text-sm sm:min-h-10 sm:px-3 sm:text-base" aria-label={`Next month, ${next.label}`}>
              <span className="hidden sm:inline">{next.short} </span>›
            </Link>
          )}
          {!isCurrent && (
            <Link href="/calendar" className="btn btn-ghost min-h-9 px-2.5 text-sm sm:min-h-10 sm:px-3 sm:text-base">
              Today
            </Link>
          )}
          <ShareMonthButton date={isCurrent ? today : month.days[0]} today={today} />
          <Link href={`/calendar/year?y=${month.year}`} className="btn btn-ghost min-h-9 px-2.5 text-sm sm:min-h-10 sm:px-3 sm:text-base">
            Year
          </Link>
        </nav>
      </div>

      <MonthGrid key={month.key} month={month} today={today} photos={photos} addToday={add === "today"} />
    </div>
  );
}
