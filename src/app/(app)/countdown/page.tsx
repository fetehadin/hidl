import type { Metadata } from "next";
import Link from "next/link";
import { CountdownCard } from "@/components/countdown/countdown-card";
import { HourglassIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { listCountdowns } from "@/lib/data/countdowns";
import { requireUser } from "@/lib/supabase/server";
import { requestNow } from "@/lib/time";

export const metadata: Metadata = { title: "Countdown" };

export default async function CountdownPage() {
  const { supabase } = await requireUser();
  const countdowns = await listCountdowns(supabase);
  const now = requestNow();

  return (
    <>
      <PageHeader eyebrow="deadlines" title="Countdown">
        <div className="flex gap-2">
          <Link href="/countdown/settings" className="btn btn-ghost">Widget</Link>
          <Link href="/countdown/new" className="btn btn-primary">New</Link>
        </div>
      </PageHeader>

      {countdowns.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <HourglassIcon width={40} height={40} className="text-accent" />
          <p className="mt-3 font-display text-2xl">No countdowns yet.</p>
          <p className="mt-1 max-w-xs text-ink-soft">
            Add an exam with a target score, or any other deadline you&apos;re counting down to.
          </p>
          <Link href="/countdown/new" className="btn btn-primary mt-5">Add one</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {countdowns.map((c) => (
            <CountdownCard key={c.id} countdown={c} now={now} />
          ))}
        </div>
      )}
    </>
  );
}
