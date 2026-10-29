import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";
import { LiveCountdown } from "@/components/countdown/live-countdown";
import { DashboardCard } from "@/components/dashboard-card";
import { DashboardTodayPhoto } from "@/components/dashboard-today-photo";
import { Envelope } from "@/components/envelope";
import { sealInitial } from "@/components/letters/letter-card";
import { LiveRelative } from "@/components/live-relative";
import { getPrimaryCountdown } from "@/lib/data/countdowns";
import { letterSummary } from "@/lib/data/letters";
import { listPhotosForDate, signPhotos } from "@/lib/data/photos";
import { requireUser } from "@/lib/supabase/server";
import { formatInAppTz, greeting, requestNow, todayISO } from "@/lib/time";

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  const now = requestNow();
  const today = todayISO(new Date(now));

  const [countdown, letters, todaysPhotos] = await Promise.all([
    getPrimaryCountdown(supabase),
    letterSummary(supabase),
    listPhotosForDate(supabase, today),
  ]);
  const latestPhotoRow = todaysPhotos.at(-1);
  const [photo] = latestPhotoRow ? await signPhotos(supabase, [latestPhotoRow]) : [];
  const countdownDone = countdown ? new Date(countdown.target_at).getTime() <= now : false;

  return (
    <div>
      <div className="pt-4 pb-6">
        <p className="eyebrow mb-1">{formatInAppTz(new Date(now), "EEEE, MMMM d")}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{greeting(new Date(now))}.</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Primary countdown: a real hero, not a stacked card */}
        {!countdown ? (
          <DashboardCard eyebrow="deadlines" href="/countdown/new" linkLabel="Add a countdown" className="sm:col-span-2">
            <p className="font-display text-xl">No countdowns yet.</p>
            <p className="text-ink-soft">Add an exam with a target score, or any other deadline.</p>
          </DashboardCard>
        ) : (
          <div className="card card-interactive animate-fade-up p-6 sm:col-span-2 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="eyebrow mb-1">{countdownDone ? "it's over" : "the big day"}</p>
                <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{countdown.title}</h2>
                <p className="mt-1 text-ink-soft">{formatInAppTz(countdown.target_at, "EEEE, MMMM d, yyyy")}</p>

                {countdown.kind === "exam" && (
                  <p className="mt-4">
                    <span className="block text-sm font-semibold text-ink-soft">
                      {countdownDone && countdown.actual_score !== null ? "Your score" : "Target score"}
                    </span>
                    <span className="font-display text-3xl font-semibold tabular-nums text-accent">
                      {countdownDone && countdown.actual_score !== null ? countdown.actual_score : countdown.target_score}
                    </span>
                    <span className="text-lg text-muted"> / {countdown.max_score}</span>
                  </p>
                )}

                <Link
                  href="/countdown"
                  className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {countdownDone && countdown.kind === "exam" && countdown.actual_score === null
                    ? "Enter your score"
                    : "Open countdown"}
                  <ArrowRightIcon width={16} height={16} />
                </Link>
              </div>

              <div className="shrink-0 self-start sm:self-center">
                {countdownDone ? (
                  <p className="font-display text-5xl font-semibold text-accent sm:text-6xl">Done!</p>
                ) : (
                  <LiveCountdown target={countdown.target_at} serverNow={now} variant="compact" />
                )}
              </div>
            </div>
          </div>
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
        <DashboardCard eyebrow="today's picture" href="/calendar" linkLabel={photo ? "See the month" : "See the calendar"}>
          <DashboardTodayPhoto photo={photo ?? null} today={today} />
        </DashboardCard>
      </div>
    </div>
  );
}
