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
  // Distinct days with at least one photo — a day can now hold several, so photos.length
  // alone would overcount (and could exceed `elapsed`, which reads as broken).
  const daysCaptured = new Set(photos.map((p) => p.date)).size;

  return (
    <div className="@container -mb-10 sm:-mb-14">
      {/* Kept to two short rows so the whole month fits on screen without scrolling. */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pt-2 sm:pt-3">
        <div className="min-w-0">
          <p className="eyebrow mb-0.5">your days in pictures</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{monthLabel(month)}</h1>
        </div>
        <nav aria-label="Months" className="flex items-center gap-2">
          <Link href={`/calendar?m=${prev}`} className="btn btn-ghost min-h-10 px-3" aria-label={`Previous month, ${monthLabel(prev)}`}>
            ‹ {monthLabel(prev, "short")}
          </Link>
          {isCurrent ? (
            <button type="button" disabled aria-label="No next month yet" className="btn btn-ghost min-h-10 px-3">
              {monthLabel(next, "short")} ›
            </button>
          ) : (
            <Link href={`/calendar?m=${next}`} className="btn btn-ghost min-h-10 px-3" aria-label={`Next month, ${monthLabel(next)}`}>
              {monthLabel(next, "short")} ›
            </Link>
          )}
          <Link href={`/calendar/year?y=${month.slice(0, 4)}`} className="btn btn-ghost min-h-10 px-3">
            Year
          </Link>
        </nav>
      </div>

      <p className="mb-2 flex flex-wrap items-baseline gap-x-3 text-sm text-ink-soft" aria-live="polite">
        <span>
          <strong className="font-display text-lg text-ink">{daysCaptured}</strong> of {elapsed} days captured
        </span>
        {photos.length === 0 && (
          <span className="text-muted">
            {isCurrent ? "Tap today to add your first picture." : "Tap any day to add a picture."}
          </span>
        )}
        {!isCurrent && (
          <Link href="/calendar" className="font-semibold text-accent underline-offset-4 hover:underline">
            Back to this month
          </Link>
        )}
      </p>

      <div className="card p-2 sm:p-4">
        <MonthGrid key={month} month={month} today={today} photos={photos} />
      </div>
    </div>
  );
}
