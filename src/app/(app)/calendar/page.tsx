import type { Metadata } from "next";
import Link from "next/link";
import { MonthGrid } from "@/components/calendar/month-grid";
import { addMonths, daysInMonth, leadingBlanks, monthLabel, monthOf } from "@/lib/calendar";
import { listPhotos, signPhotos } from "@/lib/data/photos";
import { requireUser } from "@/lib/supabase/server";
import { todayISO } from "@/lib/time";
import { monthParam } from "@/lib/validation/photos";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const { m, add } = await searchParams;
  const { supabase, timeZone } = await requireUser();
  const today = todayISO(timeZone);
  const currentMonth = monthOf(today);
  const requested = monthParam.parse(typeof m === "string" ? m : undefined);
  const month = requested && requested <= currentMonth ? requested : currentMonth;

  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const photos = await signPhotos(supabase, await listPhotos(supabase, `${month}-01`, last));

  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const isCurrent = month === currentMonth;
  const rows = Math.ceil((leadingBlanks(month) + daysInMonth(month)) / 7);

  return (
    // On wide screens the month narrows so its cells stay portrait (about 4:5), like photos.
    <div
      className="@container -mx-3 -mb-[6.5rem] sm:mx-auto sm:-mb-[5.5rem] sm:max-w-[calc((100dvh-16.5rem)/var(--rows)*7*0.8)]"
      style={{ "--rows": rows } as React.CSSProperties}
    >
      {/* One short row, so the month itself gets the room. Phones show chevrons only. */}
      <div className="mb-2 flex items-center justify-between gap-3 px-3 pt-1 sm:mb-3 sm:px-0 sm:pt-2">
        <h1 className="font-title text-[1.6rem] leading-tight font-medium tracking-tight whitespace-nowrap sm:text-4xl">{monthLabel(month)}</h1>
        <nav aria-label="Months" className="flex items-center gap-1.5 sm:gap-2">
          <Link href={`/calendar?m=${prev}`} className="btn btn-ghost min-h-9 px-2.5 text-sm sm:min-h-10 sm:px-3 sm:text-base" aria-label={`Previous month, ${monthLabel(prev)}`}>
            ‹<span className="hidden sm:inline"> {monthLabel(prev, "short")}</span>
          </Link>
          {isCurrent ? (
            <button type="button" disabled aria-label="No next month yet" className="btn btn-ghost min-h-9 px-2.5 text-sm sm:min-h-10 sm:px-3 sm:text-base">
              <span className="hidden sm:inline">{monthLabel(next, "short")} </span>›
            </button>
          ) : (
            <Link href={`/calendar?m=${next}`} className="btn btn-ghost min-h-9 px-2.5 text-sm sm:min-h-10 sm:px-3 sm:text-base" aria-label={`Next month, ${monthLabel(next)}`}>
              <span className="hidden sm:inline">{monthLabel(next, "short")} </span>›
            </Link>
          )}
          {!isCurrent && (
            <Link href="/calendar" className="btn btn-ghost min-h-9 px-2.5 text-sm sm:min-h-10 sm:px-3 sm:text-base">
              Today
            </Link>
          )}
          <Link href={`/calendar/year?y=${month.slice(0, 4)}`} className="btn btn-ghost min-h-9 px-2.5 text-sm sm:min-h-10 sm:px-3 sm:text-base">
            Year
          </Link>
        </nav>
      </div>

      <MonthGrid key={month} month={month} today={today} photos={photos} addToday={add === "today"} />
    </div>
  );
}
