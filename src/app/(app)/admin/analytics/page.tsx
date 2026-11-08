import type { Metadata } from "next";
import { DailyChart } from "@/components/admin/daily-chart";
import { Stat } from "@/components/admin/stat";
import { fillDays, shares } from "@/lib/analytics-format";
import { hogql, posthogReadConfig } from "@/lib/posthog-api";
import { publicEnv } from "@/lib/public-env";
import { requireAdmin } from "@/lib/supabase/server";
import { todayISO } from "@/lib/time";

export const metadata: Metadata = { title: "Analytics" };

const nf = new Intl.NumberFormat("en-US");
const pct = (n: number) => `${Math.round(n * 100)}%`;

// Page views only (that's all hidl sends). Ids in paths are folded into ":id" so pages group.
const Q = {
  daily: `SELECT toDate(timestamp) AS day, count(DISTINCT person_id) FROM events
    WHERE event = '$pageview' AND timestamp > now() - INTERVAL 30 DAY GROUP BY day ORDER BY day`,
  totals: `SELECT count(DISTINCT person_id), count() FROM events
    WHERE event = '$pageview' AND timestamp > now() - INTERVAL 30 DAY`,
  countries: `SELECT properties.$geoip_country_name AS country, count(DISTINCT person_id) AS people FROM events
    WHERE event = '$pageview' AND timestamp > now() - INTERVAL 30 DAY GROUP BY country ORDER BY people DESC LIMIT 12`,
  devices: `SELECT if(properties.$raw_user_agent LIKE '%hidl-app%', 'Android app', properties.$device_type) AS device,
    count(DISTINCT person_id) AS people FROM events
    WHERE event = '$pageview' AND timestamp > now() - INTERVAL 30 DAY GROUP BY device ORDER BY people DESC`,
  pages: `SELECT replaceRegexpAll(properties.$pathname, '[0-9a-f]{8}-[0-9a-f-]{27}', ':id') AS page, count() AS views FROM events
    WHERE event = '$pageview' AND timestamp > now() - INTERVAL 30 DAY GROUP BY page ORDER BY views DESC LIMIT 8`,
};

/**
 * Growth, geography and devices from PostHog (page views from the website and the phone app).
 * Retention and totals that matter for running hidl are on the Overview, straight from the
 * database. Admins only, like every /admin page; the PostHog key stays on the server.
 */
export default async function AdminAnalyticsPage() {
  const { timeZone } = await requireAdmin();

  if (!posthogReadConfig()) {
    return (
      <div className="card p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">Connect PostHog</h2>
        <p className="mt-2 text-ink-soft">
          {publicEnv.NEXT_PUBLIC_POSTHOG_KEY ? "Page views are being sent. " : "Page views aren't being sent yet (set NEXT_PUBLIC_POSTHOG_KEY). "}
          To show them here, set <code>POSTHOG_PERSONAL_API_KEY</code> (a personal API key with the <code>query:read</code> scope)
          and <code>POSTHOG_PROJECT_ID</code> on the server.
        </p>
      </div>
    );
  }

  let data;
  try {
    const [daily, totals, countries, devices, pages] = await Promise.all(Object.values(Q).map((q) => hogql(q)));
    data = { daily, totals, countries, devices, pages };
  } catch (error) {
    console.error("adminAnalytics", error);
    return (
      <div className="card p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold">PostHog didn&apos;t answer</h2>
        <p className="mt-2 text-ink-soft">Check the API key and project id on the System tab, then reload.</p>
      </div>
    );
  }

  const days = fillDays(data.daily.results, todayISO(timeZone));
  const [visitors = 0, views = 0] = (data.totals.results[0] ?? []).map(Number);
  const countryRows = shares(data.countries.results);
  const deviceRows = shares(data.devices.results);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="reach">
        <h2 id="reach" className="font-display mb-3 text-xl font-semibold">Last 30 days</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={visitors === 1 ? "visitor" : "visitors"} value={visitors} sub="signed in or not" />
          <Stat label="page views" value={views} />
          <Stat label="today" value={days.at(-1)?.count ?? 0} sub="visitors" />
          <Stat label="busiest day" value={Math.max(0, ...days.map((d) => d.count))} sub="visitors" />
        </div>
      </section>

      <DailyChart
        id="posthog-daily"
        title="Visitors each day"
        note="from PostHog · last 30 days"
        daily={days.map((d) => ({ day: d.day, people: d.count, visits: 0, signups: 0 }))}
        metric="people"
        unit={["visitor", "visitors"]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Breakdown id="countries" title="Where people are" rows={countryRows} unit="people" />
        <Breakdown id="devices" title="How they open hidl" rows={deviceRows} unit="people" />
      </div>

      <section aria-labelledby="pages" className="card p-5 sm:p-6">
        <h2 id="pages" className="font-display mb-3 text-xl font-semibold">Most viewed pages</h2>
        <table className="w-full text-sm">
          <tbody>
            {data.pages.results.map(([page, n]) => (
              <tr key={String(page)} className="border-t border-line first:border-0">
                <td className="py-2 font-mono">{String(page ?? "")}</td>
                <td className="py-2 text-right font-semibold tabular-nums">{nf.format(Number(n) || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Breakdown({ id, title, rows, unit }: { id: string; title: string; rows: ReturnType<typeof shares>; unit: string }) {
  return (
    <section aria-labelledby={id} className="card p-5 sm:p-6">
      <h2 id={id} className="font-display mb-3 text-xl font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted">No visits yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold">{r.label}</span>
                <span className="text-muted tabular-nums">
                  {nf.format(r.count)} {unit} · {pct(r.share)}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-paper-deep" aria-hidden>
                <div className="h-full rounded-full bg-teal" style={{ width: `${Math.max(2, r.share * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
