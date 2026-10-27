import type { Metadata } from "next";
import Link from "next/link";
import { MonthGrid } from "@/components/calendar/month-grid";
import { PageHeader } from "@/components/page-header";
import { addMonths, daysInMonth, monthLabel, monthOf } from "@/lib/calendar";
import { listPhotos, signPhotos } from "@/lib/data/photos";
import { requireUser } from "@/lib/supabase/server";
import { todayISO } from "@/lib/time";
import { monthParam } from "@/lib/validation/photos";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const { m } = await searchParams;
  const today = todayISO();
  const currentMonth = monthOf(today);
  const requested = monthParam.parse(typeof m === "string" ? m : undefined);
  const month = requested && requested <= currentMonth ? requested : currentMonth;

  const { supabase } = await requireUser();
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const photos = await signPhotos(supabase, await listPhotos(supabase, `${month}-01`, last));

  const elapsed = month === currentMonth ? Number(today.slice(8)) : daysInMonth(month);
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const isCurrent = month === currentMonth;

  return (
    <>
      <PageHeader eyebrow="senior year in pictures" title={monthLabel(month)}>
        <Link href={`/calendar/year?y=${month.slice(0, 4)}`} className="btn btn-ghost">
          Year
        </Link>
      </PageHeader>

      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={`/calendar?m=${prev}`} className="btn btn-ghost min-h-10 px-3" aria-label={`Previous month, ${monthLabel(prev)}`}>
          ‹ {monthLabel(prev, "short")}
        </Link>
        <p className="text-center text-sm text-ink-soft" aria-live="polite">
          <strong className="font-display text-lg text-ink">{photos.length}</strong> of {elapsed} days
        </p>
        {isCurrent ? (
          <span className="btn btn-ghost invisible min-h-10 px-3" aria-hidden>
            {monthLabel(next, "short")} ›
          </span>
        ) : (
          <Link href={`/calendar?m=${next}`} className="btn btn-ghost min-h-10 px-3" aria-label={`Next month, ${monthLabel(next)}`}>
            {monthLabel(next, "short")} ›
          </Link>
        )}
      </div>

      <div className="card p-2.5 sm:p-5">
        <MonthGrid key={month} month={month} today={today} photos={photos} />
      </div>

      {photos.length === 0 && (
        <p className="mt-4 text-center text-ink-soft">
          {isCurrent ? "Tap today to add your first picture." : "No pictures this month. Tap any past day to add one."}
        </p>
      )}
      {!isCurrent && (
        <p className="mt-4 text-center">
          <Link href="/calendar" className="text-sm font-semibold text-accent underline-offset-4 hover:underline">
            Back to this month
          </Link>
        </p>
      )}
    </>
  );
}
