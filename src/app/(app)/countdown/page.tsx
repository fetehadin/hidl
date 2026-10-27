import type { Metadata } from "next";
import Link from "next/link";
import { LiveCountdown } from "@/components/countdown/live-countdown";
import { ScoreCompare } from "@/components/countdown/score-compare";
import { ScoreForm } from "@/components/countdown/score-form";
import { HourglassIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { getExam } from "@/lib/data/exam";
import { requireUser } from "@/lib/supabase/server";
import { formatInAppTz, requestNow } from "@/lib/time";

export const metadata: Metadata = { title: "Countdown" };

export default async function CountdownPage() {
  const { supabase } = await requireUser();
  const exam = await getExam(supabase);
  const now = requestNow();

  if (!exam) {
    return (
      <>
        <PageHeader eyebrow="the big day" title="Countdown" />
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <HourglassIcon width={40} height={40} className="text-accent" />
          <p className="mt-3 font-display text-2xl">No exam date yet.</p>
          <p className="mt-1 max-w-xs text-ink-soft">Add your entrance exam and the score you&apos;re aiming for.</p>
          <Link href="/countdown/settings" className="btn btn-primary mt-5">Set up countdown</Link>
        </div>
      </>
    );
  }

  const done = new Date(exam.exam_at).getTime() <= now;
  const when = formatInAppTz(exam.exam_at, "EEEE, MMMM d, yyyy 'at' h:mm a");

  return (
    <>
      <PageHeader eyebrow={done ? "it's over" : "the big day"} title={exam.exam_name}>
        <Link href="/countdown/settings" className="btn btn-ghost">Edit</Link>
      </PageHeader>

      {!done ? (
        <div className="space-y-6">
          <p className="-mt-3 text-ink-soft">{when}</p>
          <LiveCountdown target={exam.exam_at} serverNow={now} />
          <div className="card flex flex-col items-center px-6 py-8 text-center">
            <p className="eyebrow">aiming for</p>
            <p className="mt-2 font-display font-semibold tabular-nums">
              <span className="text-2xl sm:text-3xl">Target: </span>
              <span className="text-5xl whitespace-nowrap sm:text-6xl">
                <span className="text-accent">{exam.target_score}</span>
                <span className="text-muted"> / {exam.max_score}</span>
              </span>
            </p>
            <p className="mt-2 text-ink-soft">
              That&apos;s {Math.round((exam.target_score / exam.max_score) * 100)}%. You&apos;ve got this.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="card px-6 py-10 text-center">
            <p className="font-display text-6xl font-semibold text-accent sm:text-7xl">Done!</p>
            <p className="mt-3 text-ink-soft">The exam was on {when}.</p>
            <p className="text-ink-soft">
              Your target was <strong className="text-ink">{exam.target_score} / {exam.max_score}</strong>.
            </p>
          </div>
          <div className="card space-y-6 p-6">
            {exam.actual_score !== null && (
              <ScoreCompare actual={exam.actual_score} target={exam.target_score} max={exam.max_score} />
            )}
            <ScoreForm max={exam.max_score} current={exam.actual_score} />
          </div>
        </div>
      )}
    </>
  );
}
