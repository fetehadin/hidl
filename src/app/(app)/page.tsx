import Link from "next/link";
import { ArrowRightIcon, HourglassIcon, PlusIcon } from "@/components/icons";
import { KindBadge } from "@/components/countdown/kind-icon";
import { LiveCountdown } from "@/components/countdown/live-countdown";
import { Mascot, type MascotMood } from "@/components/mascot";
import { BoardCard } from "@/components/today/board-card";
import { LetterTile } from "@/components/today/letter-tile";
import { MonthGlance } from "@/components/today/month-glance";
import { StreakRow } from "@/components/today/streak-row";
import { TodayPhoto } from "@/components/today/today-photo";
import { weekOf } from "@/lib/calendar";
import { calendarMonth, monthKeyOf } from "@/lib/calendar-months";
import { type CountdownKind, KIND_INFO } from "@/lib/countdown-kinds";
import { type Countdown, listCountdowns } from "@/lib/data/countdowns";
import { letterSummary } from "@/lib/data/letters";
import { type PhotoRow, listPhotos, signPhotos } from "@/lib/data/photos";
import { getLeaderboard } from "@/lib/data/leaderboard";
import { getProfile } from "@/lib/data/profile";
import { getStreakState } from "@/lib/data/streak";
import { type CalendarPref, formatDay, formatFullDate } from "@/lib/dates";
import { greetingName } from "@/lib/names";
import { requireUser } from "@/lib/supabase/server";
import { daysUntil, formatInTz, greeting, nowInTz, requestNow, todayISO } from "@/lib/time";

/** A finished countdown stays on Today this long (or until an exam's score is in). */
const DONE_SHOWN_MS = 3 * 86_400_000;
/** The kinds offered on Today before someone has a countdown. */
const STARTER_KINDS: CountdownKind[] = ["exam", "birthday", "trip", "wedding"];

/**
 * Today. Every part of the app has a place here even before it's used (a camera for today's
 * photo, a blank envelope, countdown kinds to pick), so a new person sees what hidl is for
 * without reading about it.
 *
 * Phone: greeting and Hidi, the streak, the leaderboard, the countdown, then today's photo and
 * the next letter side by side. Wide screens: a three-column grid where the photo stands tall on
 * the right and this month's photo calendar fills the space under the countdown.
 */
export default async function DashboardPage() {
  const { supabase, user, calendar, timeZone, accountName } = await requireUser();
  const now = requestNow();
  const today = todayISO(timeZone, new Date(now));
  const week = weekOf(today);
  const month = calendarMonth(calendar, monthKeyOf(calendar, today));
  const from = month.days[0] < week[0] ? month.days[0] : week[0];

  // The streak is counted in Postgres (my_streak): only days captured on the day, or kept by a
  // freeze. It also spends freezes on missed days.
  const [streakState, countdowns, letters, photos, profile, board] = await Promise.all([
    getStreakState(supabase),
    listCountdowns(supabase),
    letterSummary(supabase),
    listPhotos(supabase, from, today),
    getProfile(supabase),
    getLeaderboard(supabase, "week"),
  ]);
  const name = greetingName(profile.displayName, accountName);
  const streak = { count: streakState.streak, todayDone: streakState.todayDone };

  const upcoming = countdowns
    .filter((c) => new Date(c.target_at).getTime() > now)
    .map((c) => ({ ...c, days: daysUntil(c.target_at, timeZone, new Date(now)) }))
    .sort((a, b) => a.days - b.days);
  // The hero: the nearest one ahead. A finished one only when
  // nothing is ahead, and only for a few days (or while an exam waits for its score).
  const lastDone = countdowns
    .filter((c) => new Date(c.target_at).getTime() <= now)
    .sort((a, b) => b.target_at.localeCompare(a.target_at))[0];
  const keepDone =
    lastDone &&
    (now - new Date(lastDone.target_at).getTime() < DONE_SHOWN_MS || (lastDone.kind === "exam" && lastDone.actual_score === null));
  const countdown = upcoming[0] ?? (keepDone ? lastDone : null);
  const comingUp = upcoming.filter((c) => c.id !== countdown?.id);

  // One picture per day: the pinned one, else the latest.
  const coverRows = new Map<string, PhotoRow>();
  for (const p of photos) if (!coverRows.get(p.date)?.is_cover) coverRows.set(p.date, p);
  const covers = new Map((await signPhotos(supabase, user.id, [...coverRows.values()])).map((p) => [p.date, p]));
  const thumbs = Object.fromEntries([...covers].map(([d, p]) => [d, p.thumbUrl]));
  const photo = covers.get(today) ?? null;

  const hidi = companionLine({
    hour: nowInTz(timeZone, new Date(now)).getHours(),
    day: today,
    todayDone: streak.todayDone,
    streak: streak.count,
    lettersReady: letters.readyCount,
    nextCountdown: upcoming[0] ?? null,
    freezeSaved: streakState.usedNow > 0,
    newcomer: !streakState.hasPhotos && countdowns.length === 0 && !letters.next && letters.readyCount === 0,
  });

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {/* One calendar only: the one picked on Account. */}
          <p className="eyebrow mb-1">
            {formatInTz(new Date(now), "EEEE", timeZone)} · {formatDay(new Date(now), calendar, timeZone)}
          </p>
          <h1 className="font-title text-4xl font-medium tracking-tight sm:text-5xl">
            {greeting(timeZone, new Date(now))}
            {name ? `, ${name}` : ""}!
          </h1>
        </div>
        <div className="animate-fade-up flex items-center gap-3 sm:max-w-sm">
          <Mascot mood={hidi.mood} size={84} />
          <p className="bubble text-[15px] font-semibold text-ink-soft">{hidi.text}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 lg:gap-5">
        <StreakRow
          className="col-span-2"
          streak={streak.count}
          todayDone={streak.todayDone}
          days={week}
          today={today}
          thumbs={thumbs}
          frozen={streakState.frozenDays.filter((d) => week.includes(d))}
          calendar={calendar}
          freezes={streakState.freezes}
          freezeMax={streakState.freezeMax}
          freezeCost={streakState.freezeCost}
          xpBalance={streakState.xpBalance}
        />
        <BoardCard rows={board.rows} className="col-span-2 lg:col-span-1" />

        {countdown ? (
          <CountdownHero countdown={countdown} now={now} calendar={calendar} timeZone={timeZone} comingUp={comingUp} />
        ) : (
          <CountdownStarter />
        )}

        <TodayPhoto
          photo={photo}
          today={today}
          href={`/calendar?m=${month.key}`}
          className="col-span-1 lg:row-span-2 lg:min-h-[26rem]"
        />
        <LetterTile next={letters.next} readyCount={letters.readyCount} className="col-span-1" />
        <MonthGlance month={month} today={today} thumbs={thumbs} className="hidden lg:flex" />
      </div>
    </div>
  );
}

/**
 * Before the first countdown: what one is for, shown with the kinds rather than explained, each
 * a shortcut to making one.
 */
function CountdownStarter() {
  return (
    <section className="card animate-fade-up col-span-2 overflow-hidden p-5 sm:p-7">
      <div className="flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-mint text-teal">
          <HourglassIcon width={28} height={28} className="animate-bob" />
        </span>
        <span className="min-w-0 flex-1">
          <p className="eyebrow">countdown</p>
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Something to look forward to?</h2>
        </span>
        <Link href="/countdown/new" className="btn btn-primary hidden shrink-0 sm:inline-flex">
          <PlusIcon width={18} height={18} />
          New countdown
        </Link>
      </div>
      <ul className="mt-4 hidden grid-cols-4 gap-3 sm:grid">
        {STARTER_KINDS.map((kind, i) => (
          <li key={kind} className="animate-fade-up" style={{ animationDelay: `${120 + i * 70}ms` }}>
            <Link
              href={`/countdown/new?kind=${kind}`}
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-mint/60 px-1 py-3 text-center transition-colors hover:bg-mint sm:flex-row sm:gap-3 sm:px-3 sm:text-left"
            >
              <KindBadge kind={kind} size={36} />
              <span className="text-[13px] font-bold text-ink sm:text-[15px]">{KIND_INFO[kind].label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/countdown/new" className="btn btn-primary mt-4 w-full sm:hidden">
        <PlusIcon width={18} height={18} />
        New countdown
      </Link>
    </section>
  );
}

/**
 * The main countdown, as before (title, date, the live tiles) plus a progress bar from the day it
 * was made to the day itself; the next ones sit under it as small two-per-row cards.
 */
function CountdownHero({
  countdown,
  now,
  calendar,
  timeZone,
  comingUp,
}: {
  countdown: Countdown;
  now: number;
  calendar: CalendarPref;
  timeZone: string;
  comingUp: (Countdown & { days: number })[];
}) {
  const info = KIND_INFO[countdown.kind] ?? KIND_INFO.deadline;
  const start = new Date(countdown.created_at).getTime();
  const end = new Date(countdown.target_at).getTime();
  const done = end <= now;
  const progress = done ? 1 : end > start ? Math.min(1, Math.max(0.02, (now - start) / (end - start))) : 0;
  const scoreDue = done && countdown.kind === "exam" && countdown.actual_score === null;

  return (
    <section className="card animate-fade-up col-span-2 p-5 sm:p-7">
      <Link href="/countdown" className="block">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="eyebrow mb-1">{info.eyebrow}</p>
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{countdown.title}</h2>
            <p className="mt-0.5 text-ink-soft">{formatFullDate(countdown.target_at, calendar, timeZone)}</p>
            {countdown.kind === "exam" && !scoreDue && (
              <p className="mt-3 text-sm font-semibold text-ink-soft">
                {done ? "Your score" : "Target"}{" "}
                <span className="font-display text-xl font-bold text-accent tabular-nums">
                  {done ? countdown.actual_score : countdown.target_score}
                </span>
                <span className="text-muted"> / {countdown.max_score}</span>
              </p>
            )}
          </div>
          <div className="flex min-w-0 lg:flex-1 lg:justify-end">
            {done ? (
              <p className="animate-pop-in inline-flex items-center gap-2 rounded-full bg-mint px-4 py-2 font-display text-lg font-bold text-ocean sm:text-xl">
                <span aria-hidden className="grid size-6 place-items-center rounded-full bg-teal text-sm text-accent-ink">✓</span>
                {info.doneText}
              </p>
            ) : (
              <LiveCountdown target={countdown.target_at} serverNow={now} units={countdown.units} size="large" />
            )}
          </div>
        </div>

        {!done && (
          <div
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper-deep"
            role="progressbar"
            aria-label="Time passed since you made this countdown"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div className="animate-grow-x relative h-full overflow-hidden rounded-full bg-teal" style={{ width: `${progress * 100}%` }}>
              <span aria-hidden className="animate-shine absolute inset-0 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
            </div>
          </div>
        )}
      </Link>

      {scoreDue && (
        <Link href="/countdown" className="mt-4 inline-flex items-center gap-1.5 font-semibold text-accent hover:underline">
          Enter your score
          <ArrowRightIcon width={16} height={16} />
        </Link>
      )}

      {comingUp.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {comingUp.slice(0, 4).map((c, i) => (
            <li key={c.id} className="animate-fade-up min-w-0" style={{ animationDelay: `${120 + i * 70}ms` }}>
              <Link href="/countdown" className="flex h-full flex-col gap-2 rounded-2xl bg-mint/70 p-3 transition-colors hover:bg-mint">
                <span className="flex items-start gap-2">
                  <KindBadge kind={c.kind} size={28} />
                  <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug font-bold text-ink">{c.title}</span>
                </span>
                <span className="mt-auto leading-none">
                  <span className="font-display text-2xl font-bold text-heading tabular-nums">{c.days}</span>{" "}
                  <span className="text-[10px] font-extrabold tracking-wider text-muted uppercase">{c.days === 1 ? "day" : "days"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
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
  freezeSaved,
  newcomer,
}: {
  hour: number;
  /** Today as "YYYY-MM-DD", to rotate lines once a day (not on every refresh). */
  day: string;
  todayDone: boolean;
  streak: number;
  lettersReady: number;
  nextCountdown: { title: string; days: number } | null;
  /** A streak freeze just covered a missed day. */
  freezeSaved: boolean;
  /** Nothing made yet: no photo, letter or countdown. */
  newcomer: boolean;
}): { mood: MascotMood; text: string } {
  const pick = (lines: string[]) => lines[[...day].reduce((n, c) => n + c.charCodeAt(0), 0) % lines.length];
  if (freezeSaved && !todayDone) return { mood: "cheer", text: "Phew! A streak freeze covered the day you missed." };
  if (newcomer) return { mood: "hi", text: "Hi, I'm Hidi! Snap today, seal a letter, count down to something." };
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
