import type { Metadata } from "next";
import Link from "next/link";
import { CountdownForm } from "@/components/countdown/countdown-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New countdown" };

export default async function NewCountdownPage() {
  await requireUser();

  return (
    <>
      <Link href="/countdown" className="text-sm text-muted hover:text-ink">← Countdown</Link>
      <PageHeader eyebrow="new" title="Add a countdown" />
      <div className="card p-5 sm:p-6">
        <CountdownForm
          locked={false}
          defaults={{ kind: "exam", title: "", target_local: "", target_score: "", max_score: "" }}
        />
      </div>
    </>
  );
}
