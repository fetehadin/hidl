import { KIND_INFO } from "@/lib/countdown-kinds";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRightIcon, CalendarIcon, FlameIcon } from "@/components/icons";
import { CountdownStat } from "@/components/countdown/countdown-stat";
import { KindBadge } from "@/components/countdown/kind-icon";
import { LiveCountdown } from "@/components/countdown/live-countdown";
import { DashboardCard } from "@/components/dashboard-card";
import { DashboardTodayPhoto } from "@/components/dashboard-today-photo";
import { Envelope } from "@/components/envelope";
import { sealInitial } from "@/components/letters/letter-card";
import { Mascot, type MascotMood } from "@/components/mascot";
import { LiveRelative } from "@/components/live-relative";
import { WeekStrip } from "@/components/week-strip";
import { listCountdowns, pickPrimaryCountdown } from "@/lib/data/countdowns";
import { formatDay, formatFullDate } from "@/lib/dates";
import { letterSummary } from "@/lib/data/letters";
import { addDays, photoStreak, weekOf } from "@/lib/calendar";
import { type PhotoRow, listPhotoDates, listPhotos, signPhotos } from "@/lib/data/photos";
import { requireUser } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data/profile";
import { greetingName } from "@/lib/names";
import { monthKeyOf } from "@/lib/calendar-months";
import { daysUntil, formatInTz, greeting, nowInTz, requestNow, todayISO } from "@/lib/time";

export default async function DashboardPage() {
  const { supabase, user, calendar, timeZone, accountName } = await requireUser();
  const now = requestNow();
  const today = todayISO(timeZone, new Date(now));
  const week = weekOf(today);

  const [countdowns, letters, weekPhotos, recentDates, profile] = await Promise.all([
    listCountdowns(supabase),
    letterSummary(supabase),
    listPhotos(supabase, week[0], today),
    listPhotoDates(supabase, addDays(today, -400), today),
    getProfile(supabase),
  ]);
  const name = greetingName(profile.displayName, accountName);
  const streak = photoStreak(recentDates, today);
  // "Days this month" in the calendar picked on Account (an Ethiopian month isn't November).
  const thisMonth = monthKeyOf(calendar, today);
  const monthDays = new Set(recentDates.filter((d) => monthKeyOf(calendar, d) === thisMonth)).size;
  const countdown = pickPrimaryCountdown(countdowns, now);
  // Every upcoming countdown, soonest first: the stat chip cycles through them, and the
  // hero lists the next few after the primary one.
  const upcoming = countdowns
    .filter((c) => new Date(c.target_at).getTime() > now)
    .map((c) => ({ ...c, days: daysUntil(c.target_at, timeZone, new Date(now)) }));
  const comingUp = upcoming.filter((c) => c.id !== countdown?.id);
  // One picture per day this week: the pinned one, else the latest.
  const coverRows = new Map<string, PhotoRow>();
  for (const p of weekPhotos) if (!coverRows.get(p.date)?.is_cover) coverRows.set(p.date, p);
  const weekCovers = new Map((await signPhotos(supabase, user.id, [...coverRows.values()])).map((p) => [p.date, p]));
  const photo = weekCovers.get(today);
  const countdownDone = countdown ? new Date(countdown.target_at).getTime() <= now : false;
  const hidi = companionLine({
    hour: nowInTz(timeZone, new Date(now)).getHours(),
    day: today,
    todayDone: streak.todayDone,
    streak: streak.count,
    lettersReady: letters.readyCount,
    nextCountdown: upcoming.length ? [...upcoming].sort((a, b) => a.days - b.days)[0] : null,
  });

  return (
    <div>
      <div className="flex flex-col gap-5 pt-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {/* One calendar only: the one picked on Account. */}
          <p className="eyebrow mb-1">
            {formatInTz(new Date(now), "EEEE", timeZone)} · {formatDay(new Date(now), calendar, timeZone)}
          </p>
          <h1 className="font-title text-4xl font-medium tracking-tight sm:text-5xl">{greeting(timeZone, new Date(now))}{name ? `, ${name}` : ""}!</h1>
        </div>
        <div className="animate-fade-up flex items-center gap-3 sm:max-w-sm">
          <Mascot mood={hidi.mood} size={92} />
          <p className="bubble text-[15px] font-semibold text-ink-soft">{hidi.text}</p>
        </div>
      </div>

      <WeekStrip days={week} today={today} covers={weekCovers} calendar={calendar} />

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
        <CountdownStat items={upcoming.map((c) => ({ id: c.id, title: c.title, days: c.days }))} />
      </ul>
      <p className="-mt-2 mb-5 text-right text-sm">
        <Link href="/leaderboard" className="font-bold text-accent hover:underline">
          See this week&apos;s streak leaderboard →
        </Link>
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Primary countdown: a real hero, not a stacked card */}
        {!countdown ? (
          <DashboardCard eyebrow="deadlines" href="/countdown/new" linkLabel="Add a countdown" className="sm:col-span-2">
            <p className="font-display text-xl">No countdowns yet.</p>
            <p className="text-ink-soft">An exam, a birthday, a trip: anything you&apos;re counting down to.</p>
          </DashboardCard>
        ) : (
          <div className="card card-interactive animate-fade-up p-6 sm:col-span-2 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="eyebrow mb-1">{countdownDone ? "it's over" : (KIND_INFO[countdown.kind] ?? KIND_INFO.deadline).eyebrow}</p>
                <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{countdown.title}</h2>
                <p className="mt-1 text-ink-soft">{formatFullDate(countdown.target_at, calendar, timeZone)}</p>

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

              <div className="flex min-w-0 lg:flex-1 lg:justify-end">
                {countdownDone ? (
                  <p className="font-display text-5xl font-semibold text-accent sm:text-6xl">{(KIND_INFO[countdown.kind] ?? KIND_INFO.deadline).doneText}</p>
                ) : (
                  <LiveCountdown target={countdown.target_at} serverNow={now} units={countdown.units} size="large" />
                )}
              </div>
            </div>

            {comingUp.length > 0 && (
              <div className="mt-6 border-t-2 border-mint pt-4">
                <h3 className="eyebrow mb-2">also coming up</h3>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {comingUp.slice(0, 3).map((c) => (
                    <li key={c.id}>
                      <Link
                        href="/countdown"
                        className="flex items-center gap-3 rounded-2xl bg-mint/60 px-3 py-2.5 transition-colors hover:bg-mint"
                      >
                        <KindBadge kind={c.kind} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-ink">{c.title}</span>
                          <span className="block text-xs font-semibold text-muted">
                            {formatDay(c.target_at, calendar, timeZone)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-display text-xl leading-none font-semibold text-heading tabular-nums">
                            {c.days}
                          </span>
                          <span className="block text-[10px] font-extrabold tracking-wide text-muted uppercase">
                            {c.days === 1 ? "day" : "days"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {comingUp.length > 3 && (
                  <Link
                    href="/countdown"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
                  >
                    {comingUp.length - 3} more
                    <ArrowRightIcon width={14} height={14} />
                  </Link>
                )}
              </div>
            )}
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

/**
 * What Hidi says on the dashboard: one nudge, picked by what matters most right now. Never the
 * streak count (the flame shows that). Lines that would repeat every visit rotate by day, so the
 * same person doesn't read the same sentence twice in a row.
 */
function companionLine({
  hour,
  day,
  todayDone,
  streak,
  lettersReady,
  nextCountdown,
}: {
  hour: number;
  /** Today as "YYYY-MM-DD", to rotate lines once a day (not on every refresh). */
  day: string;
  todayDone: boolean;
  streak: number;
  lettersReady: number;
  nextCountdown: { title: string; days: number } | null;
}): { mood: MascotMood; text: string } {
  const pick = (lines: string[]) => lines[[...day].reduce((n, c) => n + c.charCodeAt(0), 0) % lines.length];
  if (lettersReady > 0) return { mood: "cheer", text: "Psst! A letter from past you is ready to open." };
  if (nextCountdown && nextCountdown.days === 0) return { mood: "cheer", text: `${nextCountdown.title} is today. You've got this!` };
  if (nextCountdown && nextCountdown.days === 1) return { mood: "wave", text: `${nextCountdown.title} is tomorrow. Deep breath.` };
  if (todayDone) {
    return {
      mood: "cheer",
      text: pick([
        "Today's in the book. Nice one!",
        "Saved. Future you will love this one.",
        "Got it. Want to add a caption while it's fresh?",
        "Lovely. Today's officially remembered.",
      ]),
    };
  }
  if (hour < 5) return { mood: "sleepy", text: "Up late? Even a blurry photo counts for today." };
  if (streak > 0 && hour >= 20) return { mood: "wave", text: "The day's almost over. One photo keeps the flame lit." };
  if (hour < 12) return { mood: "wave", text: pick(["Morning! What does today look like?", "Good morning. Breakfast counts as a photo.", "New day, blank page. Snap something?"]) };
  if (hour < 17) return { mood: "wave", text: pick(["What's around you right now? That's today's photo.", "One photo. Doesn't have to be pretty.", "Afternoon check-in: catch a moment?"]) };
  return { mood: "wave", text: pick(["Evening already. How was today?", "Before the day ends: one photo for the calendar?", "Golden hour. Good time for a picture."]) };
}
