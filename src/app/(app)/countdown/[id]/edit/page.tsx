import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CountdownForm } from "@/components/countdown/countdown-form";
import { PageHeader } from "@/components/page-header";
import { getCountdown } from "@/lib/data/countdowns";
import { requireUser } from "@/lib/supabase/server";
import { utcToLocalInput } from "@/lib/time";
import { countdownIdSchema } from "@/lib/validation/countdown";

export const metadata: Metadata = { title: "Edit countdown" };

export default async function EditCountdownPage({ params }: PageProps<"/countdown/[id]/edit">) {
  const { id } = await params;
  const parsed = countdownIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  const { supabase } = await requireUser();
  const countdown = await getCountdown(supabase, parsed.data);
  if (!countdown) notFound();

  return (
    <>
      <Link href="/countdown" className="text-sm text-muted hover:text-ink">← Countdown</Link>
      <PageHeader eyebrow="edit" title={countdown.title} />
      <div className="card p-5 sm:p-6">
        <CountdownForm
          locked
          defaults={{
            id: countdown.id,
            kind: countdown.kind,
            title: countdown.title,
            target_local: utcToLocalInput(countdown.target_at),
            target_score: countdown.target_score !== null ? String(countdown.target_score) : "",
            max_score: countdown.max_score !== null ? String(countdown.max_score) : "",
          }}
        />
      </div>
    </>
  );
}
