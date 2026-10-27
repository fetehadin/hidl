import Link from "next/link";
import { LiveCountdown } from "@/components/countdown/live-countdown";
import { DashboardCard } from "@/components/dashboard-card";
import { Envelope } from "@/components/envelope";
import { sealInitial } from "@/components/letters/letter-card";
import { LiveRelative } from "@/components/live-relative";
import { getExam } from "@/lib/data/exam";
import { letterSummary } from "@/lib/data/letters";
import { getPhoto, signPhotos } from "@/lib/data/photos";
import { requireUser } from "@/lib/supabase/server";
import { formatInAppTz, greeting, requestNow, todayISO } from "@/lib/time";

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  const now = requestNow();
  const today = todayISO(new Date(now));

  const [exam, letters, photoRow] = await Promise.all([
    getExam(supabase),
    letterSummary(supabase),
    getPhoto(supabase, today),
  ]);
  const [photo] = photoRow ? await signPhotos(supabase, [photoRow]) : [];
  const examDone = exam ? new Date(exam.exam_at).getTime() <= now : false;

  return (
    <div>
      <div className="pt-4 pb-6">
        <p className="eyebrow mb-1">{formatInAppTz(new Date(now), "EEEE, MMMM d")}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{greeting(new Date(now))}.</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Exam countdown */}
        {!exam ? (
          <DashboardCard eyebrow="the big day" href="/countdown/settings" linkLabel="Set up your countdown" className="sm:col-span-2">
            <p className="font-display text-xl">No exam date yet.</p>
            <p className="text-ink-soft">Add your entrance exam date and target score.</p>
          </DashboardCard>
        ) : examDone ? (
          <DashboardCard eyebrow={exam.exam_name} href="/countdown" linkLabel={exam.actual_score === null ? "Enter your score" : "See how you did"} className="sm:col-span-2">
            <p className="font-display text-4xl font-semibold text-accent">Done!</p>
            <p className="text-ink-soft">
              {exam.actual_score === null
                ? `Target was ${exam.target_score} / ${exam.max_score}.`
                : `You scored ${exam.actual_score} / ${exam.max_score} (target ${exam.target_score}).`}
            </p>
          </DashboardCard>
        ) : (
          <DashboardCard eyebrow={exam.exam_name} href="/countdown" linkLabel="Open countdown" className="sm:col-span-2">
            <LiveCountdown target={exam.exam_at} serverNow={now} variant="compact" />
            <p className="mt-1 text-ink-soft">
              Target{" "}
              <strong className="font-display text-xl text-ink tabular-nums">
                {exam.target_score} / {exam.max_score}
              </strong>{" "}
              · {formatInAppTz(exam.exam_at, "MMM d, yyyy")}
            </p>
          </DashboardCard>
        )}

        {/* Next letter */}
        {letters.readyCount > 0 ? (
          <DashboardCard eyebrow="a letter is waiting" href="/letters" linkLabel="Open it">
            <Envelope state="ready" initial="✶" className="pointer-events-none">
              <p className="font-display text-xl">
                {letters.readyCount === 1 ? "One letter is" : `${letters.readyCount} letters are`} ready to open.
              </p>
            </Envelope>
          </DashboardCard>
        ) : letters.next ? (
          <DashboardCard eyebrow="next letter" href={`/letters/${letters.next.id}`} linkLabel="See all letters">
            <Envelope state="sealed" initial={sealInitial(letters.next.recipient)}>
              <p className="font-hand text-lg leading-none text-accent">for {letters.next.recipient}</p>
              <p className="mt-1 font-display text-xl font-semibold">{letters.next.title}</p>
              <p className="mt-1 text-[15px] font-semibold text-ink-soft">
                <LiveRelative target={letters.next.unlock_at} />
              </p>
            </Envelope>
          </DashboardCard>
        ) : (
          <DashboardCard eyebrow="next letter" href="/letters/new" linkLabel="Write a letter">
            <p className="font-display text-xl">Nothing sealed yet.</p>
            <p className="text-ink-soft">Write something for future you to open later.</p>
          </DashboardCard>
        )}

        {/* Today's photo */}
        <DashboardCard eyebrow="today's picture" href="/calendar" linkLabel={photo ? "See the month" : "Add today's photo"}>
          {photo ? (
            <Link href="/calendar" className="block overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.fullUrl} alt={photo.caption ?? "Today's photo"} className="aspect-[4/3] w-full object-cover" />
              {photo.caption && <p className="mt-2 text-ink-soft">{photo.caption}</p>}
            </Link>
          ) : (
            <Link
              href="/calendar"
              className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-line bg-paper text-center text-muted transition-colors hover:border-accent hover:text-accent"
            >
              <span>
                <span className="block font-hand text-2xl">an empty page</span>
                <span className="text-sm">Tap today on the calendar</span>
              </span>
            </Link>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
