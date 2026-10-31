import type { Metadata } from "next";
import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { CountdownCard } from "@/components/countdown/countdown-card";
import { WidgetIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { listCountdowns } from "@/lib/data/countdowns";
import { requireUser } from "@/lib/supabase/server";
import { requestNow } from "@/lib/time";

export const metadata: Metadata = { title: "Countdown" };

export default async function CountdownPage() {
  const { supabase } = await requireUser();
  const countdowns = await listCountdowns(supabase);
  const now = requestNow();
  const featured = countdowns.find((c) => c.is_widget);
  const rest = countdowns.filter((c) => c.id !== featured?.id);

  return (
    <>
      <PageHeader eyebrow="deadlines" title="Countdown">
        <div className="flex gap-2">
          <Link
            href="/countdown/settings"
            title="Feed your starred countdown to a phone home-screen widget"
            className="btn btn-ghost"
          >
            <WidgetIcon width={18} height={18} />
            Widget
          </Link>
          <Link href="/countdown/new" className="btn btn-primary">New</Link>
        </div>
      </PageHeader>

      {countdowns.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <Mascot mood="curious" size={110} />
          <p className="mt-4 font-display text-2xl font-semibold">No countdowns yet.</p>
          <p className="mt-1 max-w-xs text-ink-soft">
            Add an exam with a target score, or any other deadline you&apos;re counting down to.
          </p>
          <Link href="/countdown/new" className="btn btn-primary mt-5">Add one</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {featured && <CountdownCard countdown={featured} now={now} featured />}
          {rest.length > 0 && (
            <div className={`grid gap-4 ${rest.length === 1 ? "max-w-sm sm:max-w-md" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
              {rest.map((c) => (
                <CountdownCard key={c.id} countdown={c} now={now} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
