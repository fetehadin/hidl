import type { AdminStats } from "@/lib/data/admin";

const nf = new Intl.NumberFormat("en-US");

const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

type Day = AdminStats["daily"][number];

/**
 * One bar per day for the last 30 days (moved here from the old public /stats page). One series
 * per chart, so no legend: the heading names it. Hover shows the day's numbers; the table under
 * "Show as a table" has them all for screen readers and copying.
 */
export function DailyChart({
  id,
  title,
  note,
  daily,
  metric,
  unit,
}: {
  id: string;
  title: string;
  note: string;
  daily: Day[];
  metric: "people" | "signups";
  unit: [singular: string, plural: string];
}) {
  const max = Math.max(1, ...daily.map((d) => d[metric]));
  // A "nice" top for the single gridline: the max rounded up to 1, 2 or 5 × 10^n.
  const pow = 10 ** Math.floor(Math.log10(max));
  const top = [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= max)!;
  const H = 140;
  const word = (n: number) => (n === 1 ? unit[0] : unit[1]);

  return (
    <section aria-labelledby={id} className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="font-display text-xl font-semibold">{title}</h2>
        <p className="text-sm text-muted">{note}</p>
      </div>

      <div className="relative mt-5" aria-hidden>
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 border-t border-dashed border-aqua">
          <span className="-translate-y-1/2 bg-white pr-1 text-xs font-semibold text-muted tabular-nums">{top}</span>
        </div>
        <div className="flex items-end gap-[2px] border-b-2 border-aqua" style={{ height: H }}>
          {daily.map((d) => {
            const v = d[metric];
            const h = v === 0 ? 0 : Math.max(4, (v / top) * H);
            return (
              <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center">
                <div className="w-full max-w-5 rounded-t bg-teal transition-colors group-hover:bg-ocean" style={{ height: h }} />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg border-2 border-aqua bg-white px-2 py-1 text-center text-xs whitespace-nowrap shadow-sm group-hover:block">
                  <span className="block font-bold text-heading">{dayLabel(d.day, { month: "short", day: "numeric" })}</span>
                  <span className="text-ink-soft">
                    {nf.format(v)} {word(v)}
                    {metric === "people" && ` · ${nf.format(d.visits)} ${d.visits === 1 ? "visit" : "visits"}`}
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
              <th className="py-1 text-right font-semibold capitalize">{unit[1]}</th>
              {metric === "people" && <th className="py-1 text-right font-semibold">Visits</th>}
            </tr>
          </thead>
          <tbody>
            {[...daily].reverse().map((d) => (
              <tr key={d.day} className="border-t border-aqua/60">
                <td className="py-1">{dayLabel(d.day, { weekday: "short", month: "short", day: "numeric" })}</td>
                <td className="py-1 text-right">{d[metric]}</td>
                {metric === "people" && <td className="py-1 text-right">{d.visits}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
