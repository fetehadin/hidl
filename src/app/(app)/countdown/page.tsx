import type { Metadata } from "next";
import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { CountdownCard } from "@/components/countdown/countdown-card";
import { NewCountdownButton } from "@/components/countdown/new-countdown-button";
import { WidgetIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { listCountdowns } from "@/lib/data/countdowns";
import { listCountdownWidgetTokens } from "@/lib/data/widget-token";
import { requireUser } from "@/lib/supabase/server";
import { requestNow } from "@/lib/time";

export const metadata: Metadata = { title: "Countdown" };

export default async function CountdownPage() {
  const { supabase } = await requireUser();
  const [countdowns, widgets] = await Promise.all([listCountdowns(supabase), listCountdownWidgetTokens(supabase)]);
  const now = requestNow();
  // The soonest one still to come leads (the widget shows the same one first).
  const featured = countdowns.find((c) => new Date(c.target_at).getTime() > now);
  const rest = countdowns.filter((c) => c.id !== featured?.id);

  return (
    <>
      <PageHeader eyebrow="deadlines" title="Countdown">
        <div className="flex gap-2">
          <Link
            href="/countdown/settings"
            title="Show your countdowns on your home screen"
            className="btn btn-ghost"
          >
            <WidgetIcon width={18} height={18} />
            Widget
          </Link>
          <NewCountdownButton />
        </div>
      </PageHeader>

      {countdowns.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <Mascot mood="curious" size={110} />
          <p className="mt-4 font-display text-2xl font-semibold">No countdowns yet.</p>
          <p className="mt-1 max-w-xs text-ink-soft">
            An exam, a birthday, a wedding, a trip: anything you&apos;re counting down to.
          </p>
          <NewCountdownButton label="Add one" className="mt-5" />
        </div>
      ) : (
        <div className="space-y-4">
          {featured && <CountdownCard countdown={featured} now={now} featured widgetCreatedAt={widgets.get(featured.id) ?? null} />}
          {rest.length > 0 && (
            <div className={`grid gap-4 ${rest.length === 1 ? "max-w-sm sm:max-w-md" : "md:grid-cols-2 xl:grid-cols-3"}`}>
              {rest.map((c) => (
                <CountdownCard key={c.id} countdown={c} now={now} widgetCreatedAt={widgets.get(c.id) ?? null} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
