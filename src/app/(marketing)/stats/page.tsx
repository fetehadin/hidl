import type { Metadata } from "next";
import Link from "next/link";
import { getPublicStats, type PublicStats } from "@/lib/data/stats";
import { createClient } from "@/lib/supabase/server";

/**
 * Public usage numbers, for anyone (signed in or not). Totals only: public_stats() in
 * ..._usage_stats.sql never returns anything about one person. Visits are counted by
 * <UsagePing> in the app layout.
 */
export const metadata: Metadata = {
  title: "hidl in numbers",
  description: "How many people use hidl, and how much they've written, counted down and photographed.",
  robots: { index: true, follow: true },
};

const nf = new Intl.NumberFormat("en-US");

export default async function StatsPage() {
  const stats = await getPublicStats(await createClient());

  return (
    <div className="mx-auto max-w-4xl pt-10">
      <p className="eyebrow mb-2">open numbers</p>
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">hidl in numbers</h1>
      <p className="mt-4 max-w-2xl text-lg text-ink-soft">
        How much hidl gets used, updated live. These are totals only: nobody&apos;s letters, photos or
        activity can be seen here, and letters stay end-to-end encrypted.
      </p>

      <section aria-labelledby="people" className="mt-10">
        <h2 id="people" className="sr-only">People</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={stats.people === 1 ? "person signed up" : "people signed up"} value={stats.people} />
          <Stat label="used it today" value={stats.active_today} />
          <Stat label="in the last 7 days" value={stats.active_7d} />
          <Stat label="in the last 30 days" value={stats.active_30d} />
        </div>
      </section>

      <DailyChart daily={stats.daily} visits={stats.visits_30d} />

      <section aria-labelledby="made" className="mt-6">
        <h2 id="made" className="font-display text-xl font-semibold">Made with hidl so far</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={stats.letters === 1 ? "letter sealed" : "letters sealed"} value={stats.letters} sub={`${nf.format(stats.letters_opened)} opened`} />
          <Stat label={stats.photos === 1 ? "photo" : "photos"} value={stats.photos} />
          <Stat label={stats.videos === 1 ? "video" : "videos"} value={stats.videos} />
          <Stat label={stats.countdowns === 1 ? "countdown" : "countdowns"} value={stats.countdowns} />
        </div>
      </section>

      <p className="mt-10 text-center">
        <Link href="/login" className="btn btn-primary min-h-12 px-6">
          Start your own
        </Link>
      </p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="card p-4 sm:p-5">
      <p className="font-display text-3xl font-semibold text-heading tabular-nums sm:text-4xl">{nf.format(value)}</p>
      <p className="mt-1 text-sm font-semibold text-ink-soft">{label}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

/** People per day, last 30 days. One series, so no legend: the heading names it. */
function DailyChart({ daily, visits }: { daily: PublicStats["daily"]; visits: number }) {
  const max = Math.max(1, ...daily.map((d) => d.people));
  // A "nice" top for the single gridline: the max rounded up to 1, 2 or 5 × 10^n.
  const pow = 10 ** Math.floor(Math.log10(max));
  const top = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= max)!;
  const H = 160;

  return (
    <section aria-labelledby="daily" className="card mt-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="daily" className="font-display text-xl font-semibold">People using hidl each day</h2>
        <p className="text-sm text-muted">last 30 days · {nf.format(visits)} {visits === 1 ? "visit" : "visits"}</p>
      </div>

      <div className="relative mt-5" aria-hidden>
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 border-t border-dashed border-aqua">
          <span className="-translate-y-1/2 bg-white pr-1 text-xs font-semibold text-muted tabular-nums">{top}</span>
        </div>
        <div className="flex items-end gap-[2px] border-b-2 border-aqua" style={{ height: H }}>
          {daily.map((d) => {
            const h = d.people === 0 ? 0 : Math.max(4, (d.people / top) * H);
            return (
              <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center">
                <div className="w-full max-w-5 rounded-t bg-teal transition-colors group-hover:bg-ocean" style={{ height: h }} />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg border-2 border-aqua bg-white px-2 py-1 text-center text-xs whitespace-nowrap shadow-sm group-hover:block">
                  <span className="block font-bold text-heading">{dayLabel(d.day, { month: "short", day: "numeric" })}</span>
                  <span className="text-ink-soft">
                    {d.people} {d.people === 1 ? "person" : "people"} · {d.visits} {d.visits === 1 ? "visit" : "visits"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between text-xs font-semibold text-muted">
          <span>{dayLabel(daily[0].day, { month: "short", day: "numeric" })}</span>
          <span>today</span>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold text-accent">Show as a table</summary>
        <table className="mt-2 w-full text-left tabular-nums">
          <thead>
            <tr className="text-muted">
              <th className="py-1 font-semibold">Day</th>
              <th className="py-1 text-right font-semibold">People</th>
              <th className="py-1 text-right font-semibold">Visits</th>
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((d) => (
              <tr key={d.day} className="border-t border-aqua/60">
                <td className="py-1">{dayLabel(d.day, { weekday: "short", month: "short", day: "numeric" })}</td>
                <td className="py-1 text-right">{d.people}</td>
                <td className="py-1 text-right">{d.visits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
