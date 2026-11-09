import Link from "next/link";
import { ArrowRightIcon, TrophyIcon } from "@/components/icons";
import { KindBadge } from "@/components/countdown/kind-icon";
import { LiveCountdown } from "@/components/countdown/live-countdown";
import { VideoBadge } from "@/components/calendar/video-badge";
import { sealInitial } from "@/components/letters/letter-card";
import { LiveRelative } from "@/components/live-relative";
import { Mascot, type MascotMood } from "@/components/mascot";
import { MiniEnvelope } from "@/components/today/mini-envelope";
import { StreakRow } from "@/components/today/streak-row";
import { addDays, photoStreak, weekOf } from "@/lib/calendar";
import { monthKeyOf } from "@/lib/calendar-months";
import { KIND_INFO } from "@/lib/countdown-kinds";
import { type Countdown, listCountdowns, pickPrimaryCountdown } from "@/lib/data/countdowns";
import { letterSummary } from "@/lib/data/letters";
import { type PhotoRow, type PhotoView, listPhotoDates, listPhotos, signPhotos } from "@/lib/data/photos";
import { getProfile } from "@/lib/data/profile";
import { type CalendarPref, formatDay, formatFullDate } from "@/lib/dates";
import { greetingName } from "@/lib/names";
import { requireUser } from "@/lib/supabase/server";
import { daysUntil, formatInTz, greeting, nowInTz, requestNow, todayISO } from "@/lib/time";

/**
 * Today, phone first and minimal: the greeting, Hidi, the streak (flame + this week), the main
 * countdown with the next few under it, the next letter and today's photo. Every block is the
 * link itself, so there are no "Open …" lines; blocks with nothing to show aren't shown.
 */
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
  const countdown = pickPrimaryCountdown(countdowns, now);
  const upcoming = countdowns
    .filter((c) => new Date(c.target_at).getTime() > now)
    .map((c) => ({ ...c, days: daysUntil(c.target_at, timeZone, new Date(now)) }))
    .sort((a, b) => a.days - b.days);
  const comingUp = upcoming.filter((c) => c.id !== countdown?.id);
  // One picture per day this week: the pinned one, else the latest.
  const coverRows = new Map<string, PhotoRow>();
  for (const p of weekPhotos) if (!coverRows.get(p.date)?.is_cover) coverRows.set(p.date, p);
  const weekCovers = new Map((await signPhotos(supabase, user.id, [...coverRows.values()])).map((p) => [p.date, p]));
  const photo = weekCovers.get(today);
  const hidi = companionLine({
    hour: nowInTz(timeZone, new Date(now)).getHours(),
    day: today,
    todayDone: streak.todayDone,
    streak: streak.count,
    lettersReady: letters.readyCount,
    nextCountdown: upcoming[0] ?? null,
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

      <div>
        <StreakRow
          streak={streak.count}
          todayDone={streak.todayDone}
          days={week}
          today={today}
          thumbs={Object.fromEntries([...weekCovers].map(([d, p]) => [d, p.thumbUrl]))}
          calendar={calendar}
        />
        <Link
          href="/leaderboard"
          className="mt-2 flex items-center gap-2 px-1 py-1.5 text-sm font-bold text-ink-soft hover:text-accent"
        >
          <span className="grid size-7 place-items-center rounded-[9px] bg-mint text-accent">
            <TrophyIcon width={16} height={16} />
          </span>
          Leaderboard
          <ArrowRightIcon width={14} height={14} className="ml-auto text-muted" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {countdown ? (
          <CountdownHero countdown={countdown} now={now} calendar={calendar} timeZone={timeZone} comingUp={comingUp} />
        ) : (
          <Link
            href="/countdown/new"
            className="card card-interactive flex items-center gap-3 p-5 font-bold text-accent sm:col-span-2"
          >
            Add your first countdown
            <ArrowRightIcon width={16} height={16} />
          </Link>
        )}

        {letters.readyCount > 0 ? (
          <Link href="/letters" className="card card-interactive flex items-center gap-4 p-4">
            <MiniEnvelope initial="✶" ready />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[17px] font-bold text-ink">
                {letters.readyCount === 1 ? "A letter is ready to open" : `${letters.readyCount} letters are ready to open`}
              </span>
            </span>
            <ArrowRightIcon width={16} height={16} className="shrink-0 text-muted" />
          </Link>
        ) : letters.next ? (
          <Link href={`/letters/${letters.next.id}`} className="card card-interactive flex items-center gap-4 p-4">
            <MiniEnvelope initial={sealInitial(letters.next.recipient)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-[17px] font-bold text-ink">For {letters.next.recipient}</span>
              <span className="block text-sm font-semibold text-muted">
                <LiveRelative target={letters.next.unlock_at} />
              </span>
            </span>
            <ArrowRightIcon width={16} height={16} className="shrink-0 text-muted" />
          </Link>
        ) : null}

        {photo && <TodayPhoto photo={photo} href={`/calendar?m=${monthKeyOf(calendar, today)}`} />}
      </div>
    </div>
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
    <section className="card animate-fade-up p-5 sm:col-span-2 sm:p-7">
      <Link href="/countdown" className="block">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="eyebrow mb-1">{done ? "it's over" : info.eyebrow}</p>
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
              <p className="animate-pop-in font-display text-5xl font-semibold text-accent sm:text-6xl">{info.doneText}</p>
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

/** Today's photo, smaller: the caption sits on the picture instead of under it. */
function TodayPhoto({ photo, href }: { photo: PhotoView; href: string }) {
  return (
    <Link href={href} className="animate-fade-up relative block h-52 overflow-hidden rounded-[1.5rem] bg-paper-deep sm:h-auto sm:min-h-52">
      {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link; next/image would re-fetch it */}
      <img
        src={photo.isVideo ? photo.thumbUrl : photo.fullUrl}
        alt={photo.caption ?? (photo.isVideo ? "Today's video" : "Today's photo")}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className="absolute top-2.5 left-2.5 rounded-full bg-scrim/40 px-2 py-1 text-[10px] font-extrabold tracking-widest text-snow uppercase backdrop-blur">
        Today
      </span>
      {photo.isVideo && <VideoBadge className="absolute top-2.5 right-2.5" />}
      {photo.caption && (
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-scrim/70 to-transparent px-3.5 pt-10 pb-3 text-[15px] font-semibold text-snow">
          {photo.caption}
        </span>
      )}
    </Link>
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
