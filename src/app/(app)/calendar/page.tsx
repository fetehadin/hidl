import type { Metadata } from "next";
import Link from "next/link";
import { MonthGrid } from "@/components/calendar/month-grid";
import { addMonths, daysInMonth, monthLabel, monthOf } from "@/lib/calendar";
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

  return (
    <div className="@container -mx-3 -mb-[6.5rem] sm:mx-0 sm:-mb-[5.5rem]">
      {/* One short row, so the month itself gets the room. Phones show chevrons only. */}
      <div className="mb-2 flex items-center justify-between gap-3 px-3 pt-1 sm:mb-3 sm:px-0 sm:pt-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-4xl">{monthLabel(month)}</h1>
        <nav aria-label="Months" className="flex items-center gap-1.5 sm:gap-2">
          <Link href={`/calendar?m=${prev}`} className="btn btn-ghost min-h-10 px-3" aria-label={`Previous month, ${monthLabel(prev)}`}>
            ‹<span className="hidden sm:inline"> {monthLabel(prev, "short")}</span>
          </Link>
          {isCurrent ? (
            <button type="button" disabled aria-label="No next month yet" className="btn btn-ghost min-h-10 px-3">
              <span className="hidden sm:inline">{monthLabel(next, "short")} </span>›
            </button>
          ) : (
            <Link href={`/calendar?m=${next}`} className="btn btn-ghost min-h-10 px-3" aria-label={`Next month, ${monthLabel(next)}`}>
              <span className="hidden sm:inline">{monthLabel(next, "short")} </span>›
            </Link>
          )}
          {!isCurrent && (
            <Link href="/calendar" className="btn btn-ghost min-h-10 px-3">
              Today
            </Link>
          )}
          <Link href={`/calendar/year?y=${month.slice(0, 4)}`} className="btn btn-ghost min-h-10 px-3">
            Year
          </Link>
        </nav>
      </div>

      <MonthGrid key={month} month={month} today={today} photos={photos} addToday={add === "today"} />
    </div>
  );
}
