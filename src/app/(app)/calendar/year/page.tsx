import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { WEEKDAYS } from "@/lib/calendar";
import { calendarMonth, yearMonthKeys, yearOf } from "@/lib/calendar-months";
import { listPhotoDates } from "@/lib/data/photos";
import { requireUser } from "@/lib/supabase/server";
import { todayISO } from "@/lib/time";
import { yearParam } from "@/lib/validation/photos";

export const metadata: Metadata = { title: "Year at a glance" };

export default async function YearPage({ searchParams }: PageProps<"/calendar/year">) {
  const { y } = await searchParams;
  // A year in the calendar picked on Account: 12 Gregorian months, or 13 Ethiopian (Pagume last).
  const { supabase, timeZone, calendar } = await requireUser();
  const today = todayISO(timeZone);
  const thisYear = yearOf(calendar, today);
  const parsed = yearParam.parse(typeof y === "string" ? y : undefined);
  const year = parsed && parsed <= thisYear ? parsed : thisYear;

  const months = yearMonthKeys(calendar, year).map((key) => calendarMonth(calendar, key));
  const allDays = months.flatMap((m) => m.days);
  const filled = new Set(await listPhotoDates(supabase, allDays[0], allDays[allDays.length - 1]));
  const elapsedDays = year < thisYear ? allDays.length : allDays.filter((d) => d <= today).length;
  const pct = elapsedDays ? Math.round((filled.size / elapsedDays) * 100) : 0;

  return (
    <>
      <Link href="/calendar" className="text-sm text-muted hover:text-ink">← Calendar</Link>
      <PageHeader eyebrow="year at a glance" title={String(year)}>
        <div className="flex gap-2">
          <Link href={`/calendar/year?y=${year - 1}`} className="btn btn-ghost min-h-10 px-3" aria-label={`Year ${year - 1}`}>
            ‹ {year - 1}
          </Link>
          {year < thisYear && (
            <Link href={`/calendar/year?y=${year + 1}`} className="btn btn-ghost min-h-10 px-3" aria-label={`Year ${year + 1}`}>
              {year + 1} ›
            </Link>
          )}
        </div>
      </PageHeader>

      <div className="card mb-6 flex items-center gap-5 p-5">
        <p className="font-display text-5xl font-semibold text-accent tabular-nums">{filled.size}</p>
        <div className="flex-1">
          <p className="font-semibold">
            {filled.size === 1 ? "day" : "days"} captured
            <span className="font-normal text-ink-soft"> of {elapsedDays} so far</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-deep" aria-hidden>
            <div className="h-full rounded-full bg-fresh" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-sm text-muted">{pct}% of the year&apos;s days</p>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {months.map((m) => {
          const days = m.days;
          const count = days.filter((d) => filled.has(d)).length;
          const future = days[0] > today;
          return (
            <li key={m.key}>
              <Link
                href={future ? "#" : `/calendar?m=${m.key}`}
                aria-disabled={future}
                aria-label={`${m.label}: ${count} photos`}
                className={`card block p-3 transition-transform ${future ? "pointer-events-none opacity-45" : "hover:-translate-y-0.5"}`}
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="font-display font-semibold">{m.short}</span>
                  <span className="text-xs text-muted tabular-nums">{count}</span>
                </div>
                <div className="grid grid-cols-7 gap-[3px]" aria-hidden>
                  {WEEKDAYS.map((d) => (
                    <span key={d} className="text-center text-[8px] leading-none text-muted">{d.charAt(0)}</span>
                  ))}
                  {Array.from({ length: m.leadingBlanks }, (_, i) => <span key={`b${i}`} />)}
                  {days.map((d) => (
                    <span
                      key={d}
                      className={`aspect-square rounded-[3px] ${
                        filled.has(d)
                          ? "bg-teal"
                          : d > today
                            ? "bg-transparent"
                            : d === today
                              ? "ring-1 ring-teal"
                              : "bg-paper-deep"
                      }`}
                    />
                  ))}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
