import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, CalendarIcon, FlameIcon, HourglassIcon } from "@/components/icons";
import { LiveCountdown } from "@/components/countdown/live-countdown";
import { DashboardCard } from "@/components/dashboard-card";
import { DashboardTodayPhoto } from "@/components/dashboard-today-photo";
import { Envelope } from "@/components/envelope";
import { sealInitial } from "@/components/letters/letter-card";
import { Mascot, type MascotMood } from "@/components/mascot";
import { LiveRelative } from "@/components/live-relative";
import { getPrimaryCountdown } from "@/lib/data/countdowns";
import { formatEthiopian } from "@/lib/ethiopian";
import { letterSummary } from "@/lib/data/letters";
import { addDays, photoStreak } from "@/lib/calendar";
import { listPhotoDates, listPhotosForDate, signPhotos } from "@/lib/data/photos";
import { requireUser } from "@/lib/supabase/server";
import { daysUntil, formatInAppTz, greeting, nowInAppTz, requestNow, todayISO } from "@/lib/time";

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  const now = requestNow();
  const today = todayISO(new Date(now));

  const [countdown, letters, todaysPhotos, recentDates] = await Promise.all([
    getPrimaryCountdown(supabase),
    letterSummary(supabase),
    listPhotosForDate(supabase, today),
    listPhotoDates(supabase, addDays(today, -400), today),
  ]);
  const streak = photoStreak(recentDates, today);
  const monthDays = new Set(recentDates.filter((d) => d.startsWith(today.slice(0, 7)))).size;
  const latestPhotoRow = todaysPhotos.at(-1);
  const [photo] = latestPhotoRow ? await signPhotos(supabase, [latestPhotoRow]) : [];
  const countdownDone = countdown ? new Date(countdown.target_at).getTime() <= now : false;
  const daysLeft = countdown && !countdownDone ? daysUntil(countdown.target_at, new Date(now)) : null;
  const hidi = companionLine({
    hour: nowInAppTz(new Date(now)).getHours(),
    streak: streak.count,
    todayDone: streak.todayDone,
    lettersReady: letters.readyCount,
  });

  return (
    <div>
      <div className="flex flex-col gap-5 pt-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-1">{formatEthiopian(new Date(now))}</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{greeting(new Date(now))}!</h1>
          <p className="mt-1 text-sm font-semibold text-muted">{formatInAppTz(new Date(now), "EEEE, MMMM d")}</p>
        </div>
        <div className="animate-fade-up flex items-center gap-3 sm:max-w-sm">
          <Mascot mood={hidi.mood} size={92} />
          <p className="bubble text-[15px] font-semibold text-ink-soft">{hidi.text}</p>
        </div>
      </div>

      {/* Micro-dashboard: always the same three stats, in the same places. */}
      <ul className="mb-5 grid grid-cols-3 gap-2.5 sm:gap-4" aria-label="Your stats">
        <StatChip
          tint="tint-white"
          icon={<FlameIcon width={26} height={26} className={streak.count > 0 ? "text-teal" : "text-muted"} />}
          value={streak.count}
          label="day streak"
        />
        <StatChip
          tint="tint-white"
          icon={<CalendarIcon width={26} height={26} className="text-teal" />}
          value={monthDays}
          label="days this month"
        />
        <StatChip
          tint="tint-white"
          icon={<HourglassIcon width={26} height={26} className="text-teal" />}
          value={daysLeft ?? "—"}
          label={daysLeft === null ? "no countdown" : daysLeft === 1 ? "day to go" : "days to go"}
        />
      </ul>

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
                <p className="mt-1 text-ink-soft">{formatEthiopian(countdown.target_at)}</p>
                <p className="text-sm text-muted">{formatInAppTz(countdown.target_at, "EEEE, MMMM d, yyyy")}</p>

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
        <DashboardCard
          eyebrow="today's picture"
          href={photo ? "/memories" : "/calendar"}
          linkLabel={photo ? "Wander your memories" : "See the calendar"}
          className="tint-aqua"
        >
          <DashboardTodayPhoto photo={photo ?? null} today={today} />
        </DashboardCard>
      </div>
    </div>
  );
}

function StatChip({ tint, icon, value, label }: { tint: string; icon: ReactNode; value: number | string; label: string }) {
  return (
    <li className={`clay ${tint} flex flex-col items-center gap-1 px-2 py-3 text-center sm:flex-row sm:gap-3 sm:px-5 sm:text-left`}>
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-mint">{icon}</span>
      <span>
        <span className="block font-display text-2xl leading-none font-semibold tabular-nums sm:text-3xl">{value}</span>
        <span className="block text-[11px] font-extrabold tracking-wide text-muted uppercase sm:text-xs">{label}</span>
      </span>
    </li>
  );
}

/** What Hidi says on the dashboard: one nudge, picked by what matters most right now. */
function companionLine({
  hour,
  streak,
  todayDone,
  lettersReady,
}: {
  hour: number;
  streak: number;
  todayDone: boolean;
  lettersReady: number;
}): { mood: MascotMood; text: string } {
  if (lettersReady > 0) return { mood: "cheer", text: "Psst! A letter from past you is ready to open." };
  if (todayDone) {
    return {
      mood: "cheer",
      text: streak > 1 ? `Today's captured. That's ${streak} days in a row!` : "Today's captured. Nice one!",
    };
  }
  if (hour < 5) return { mood: "sleepy", text: "Up late? Even a blurry photo counts for today." };
  if (streak > 0) return { mood: "wave", text: `Keep your ${streak}-day streak going. What does today look like?` };
  return { mood: "wave", text: "Hi! Snap one photo today and start a streak." };
}
