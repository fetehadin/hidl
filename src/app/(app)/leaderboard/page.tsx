import type { Metadata } from "next";
import Link from "next/link";
import { FlameIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { ProfileImage } from "@/components/profile/profile-image";
import { formatDayString } from "@/lib/admin-format";
import type { CalendarPref } from "@/lib/dates";
import { type LeaderboardPeriod, type LeaderboardRow, getLeaderboard } from "@/lib/data/leaderboard";
import { getProfile } from "@/lib/data/profile";
import { requireUser } from "@/lib/supabase/server";
import { FREEZE_COST, XP_RULES } from "@/lib/xp";

export const metadata: Metadata = { title: "Leaderboard" };

const NO_NAME = "A Hidl friend";
const LABEL: Record<LeaderboardPeriod, { now: string; last: string; tab: string }> = {
  week: { now: "This week", last: "Last week", tab: "Week" },
  month: { now: "This month", last: "Last month", tab: "Month" },
};
const MEDAL = ["🥇", "🥈", "🥉"];
/** Podium step heights, 1st to 3rd, and the ring around each face. */
const STEP = ["h-24", "h-16", "h-12"];
const RING = ["ring-gold", "ring-silver", "ring-bronze"];

/**
 * Who earned the most XP this week or month (leaderboard() and xp_by_day() in
 * ..._xp_and_streak_freezes.sql): a podium, your place and the gap to the next person, everyone
 * else, how XP works, and last period's final results.
 */
export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const { period: raw } = await searchParams;
  const period: LeaderboardPeriod = raw === "month" ? "month" : "week";
  const { supabase, calendar } = await requireUser();
  const [board, last, me] = await Promise.all([
    getLeaderboard(supabase, period),
    getLeaderboard(supabase, period, true),
    getProfile(supabase),
  ]);
  const mine = board.rows.find((r) => r.isMe);
  // The closest person ahead of you, to say how much XP passes them.
  const ahead = mine ? [...board.rows].reverse().find((r) => r.xp > mine.xp) : undefined;
  const mineLast = last.rows.find((r) => r.isMe);
  const podium = [2, 1, 3].map((rank) => board.rows.find((r) => r.rank === rank)).filter(Boolean) as LeaderboardRow[];
  const rest = board.rows.filter((r) => r.rank > 3);
  const left = daysLeft(board.end);

  return (
    <>
      <PageHeader eyebrow="leaderboard" title={LABEL[period].now} />

      <nav aria-label="Period" className="mb-2 grid max-w-xs grid-cols-2 rounded-full bg-paper-deep p-1">
        {(["week", "month"] as const).map((p) => (
          <Link
            key={p}
            href={`/leaderboard?period=${p}`}
            aria-current={p === period ? "page" : undefined}
            className={`rounded-full py-2 text-center text-sm font-extrabold transition-colors ${
              p === period ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {LABEL[p].tab}
          </Link>
        ))}
      </nav>
      <p className="mb-5 text-sm font-semibold text-muted">
        {range(board, calendar)} · {left === 0 ? "ends tonight" : `ends in ${left} ${left === 1 ? "day" : "days"}`}
      </p>

      {!me.showOnLeaderboard ? (
        <Notice>
          You&apos;re hidden from the leaderboard. <Link href="/account#profile" className="font-bold text-accent">Show me again</Link>
        </Notice>
      ) : !me.displayName ? (
        <Notice>
          You show up as &ldquo;{NO_NAME}&rdquo;. <Link href="/account#profile" className="font-bold text-accent">Pick a display name</Link>
        </Notice>
      ) : null}

      {board.rows.length === 0 ? (
        <p className="card p-6 text-center text-ink-soft">Nobody has XP yet. Add today&apos;s photo and you&apos;re first.</p>
      ) : (
        <>
          <ol className="grid grid-cols-3 items-end gap-2 px-1 sm:gap-4" aria-label="Top three">
            {podium.map((r) => (
              <li key={`${r.rank}-${r.displayName}-${r.isMe}`} className="min-w-0 text-center">
                {r.rank === 1 && (
                  <span aria-hidden className="animate-bob mb-0.5 block text-xl">
                    👑
                  </span>
                )}
                <span className={`mx-auto block w-fit rounded-full ring-4 ${RING[r.rank - 1]}`}>
                  <Face row={r} size={r.rank === 1 ? 60 : 50} />
                </span>
                <span className="mt-2 block truncate text-sm font-extrabold text-ink">
                  {r.isMe ? "You" : (r.displayName ?? NO_NAME)}
                </span>
                <span className="block text-xs font-extrabold text-accent tabular-nums">{r.xp} XP</span>
                <span
                  className={`animate-rise mt-2 grid ${STEP[r.rank - 1]} place-items-center rounded-t-2xl rounded-b-md bg-mint font-display text-xl font-extrabold text-heading ${r.rank === 1 ? "bg-gradient-to-b from-aqua to-mint" : ""}`}
                  style={{ animationDelay: `${[250, 100, 400][r.rank - 1]}ms` }}
                  aria-label={`Rank ${r.rank}`}
                >
                  {r.rank}
                </span>
              </li>
            ))}
          </ol>

          {me.showOnLeaderboard && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-mint px-4 py-3 ring-2 ring-teal ring-inset">
              {mine ? (
                <>
                  <span className="w-10 font-display text-2xl font-extrabold text-heading tabular-nums">#{mine.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-ocean tabular-nums">You · {mine.xp} XP</span>
                    <span className="block text-sm font-semibold text-ink-soft">
                      {ahead
                        ? `${ahead.xp - mine.xp + 1} XP to pass ${ahead.displayName ?? NO_NAME}`
                        : "You're in the lead. Keep it!"}
                    </span>
                  </span>
                </>
              ) : (
                <span className="text-sm font-semibold text-ink-soft">
                  You&apos;re not on the board yet.{" "}
                  <Link href="/calendar?add=today" className="font-bold text-accent">Add today&apos;s photo</Link> to earn XP.
                </span>
              )}
            </div>
          )}

          {rest.length > 0 && (
            <ol className="card mt-3 divide-y divide-line px-2 sm:px-4" start={4}>
              {rest.map((r, i) => (
                <li
                  key={`${r.rank}-${r.displayName}-${r.isMe}`}
                  className={`animate-fade-up flex items-center gap-3 px-2 py-2.5 ${r.isMe ? "font-bold" : ""}`}
                  style={{ animationDelay: `${i * 50}ms` }}
                  aria-current={r.isMe ? "true" : undefined}
                >
                  <span className="w-7 shrink-0 text-sm font-extrabold text-muted tabular-nums">{r.rank}</span>
                  <Face row={r} size={34} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                    {r.isMe ? "You" : (r.displayName ?? NO_NAME)}
                  </span>
                  {r.streak > 0 && (
                    <span className="flex items-center gap-0.5 text-xs font-extrabold text-flame" title={`${r.streak} days in a row`}>
                      <FlameIcon width={14} height={14} />
                      {r.streak}
                    </span>
                  )}
                  <span className="w-16 shrink-0 text-right text-sm font-extrabold text-ink-soft tabular-nums">{r.xp} XP</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      <details className="card mt-4 p-4 sm:p-5">
        <summary className="cursor-pointer text-sm font-extrabold text-accent">How XP works</summary>
        <table className="mt-3 w-full text-sm">
          <tbody className="divide-y divide-line">
            {XP_RULES.map((r) => (
              <tr key={r.what}>
                <td className="py-1.5 text-ink-soft">{r.what}</td>
                <td className="py-1.5 text-right text-xs text-muted">{r.limit}</td>
                <td className="w-24 py-1.5 text-right font-extrabold text-ink">{r.xp}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-ink-soft">
          Only things done on the day count, so filling in old days won&apos;t move you up. Spend {FREEZE_COST} XP on a
          streak freeze from the flame on Today.
        </p>
      </details>

      {last.rows.length > 0 && (
        <section aria-labelledby="last" className="mt-6">
          <h2 id="last" className="eyebrow mb-2">
            {LABEL[period].last} · final
          </h2>
          <ol className="grid gap-2 sm:grid-cols-3">
            {last.rows
              .filter((r) => r.rank <= 3)
              .map((r) => (
                <li
                  key={`${r.rank}-${r.displayName}`}
                  className={`flex items-center gap-3 rounded-2xl p-3 ${r.isMe ? "bg-mint ring-2 ring-teal ring-inset" : "bg-white/60"}`}
                >
                  <span aria-hidden className="text-2xl">{MEDAL[r.rank - 1]}</span>
                  <Face row={r} size={36} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{r.isMe ? "You" : (r.displayName ?? NO_NAME)}</span>
                    <span className="text-sm text-muted tabular-nums">{r.xp} XP</span>
                  </span>
                </li>
              ))}
          </ol>
          {mineLast && mineLast.rank > 3 && (
            <p className="mt-2 text-sm text-ink-soft">
              You finished #{mineLast.rank} with {mineLast.xp} XP.
            </p>
          )}
        </section>
      )}
    </>
  );
}

function Face({ row, size }: { row: LeaderboardRow; size: number }) {
  return <ProfileImage avatar={row.avatar} size={size} />;
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 rounded-2xl border-2 border-aqua bg-white/70 px-4 py-3 text-sm text-ink-soft">{children}</p>;
}

/** Whole days left after today until the period's last day (Addis Ababa days, like the board). */
function daysLeft(end: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(new Date());
  return Math.max(0, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000));
}

function range(b: { start: string; end: string }, calendar: CalendarPref) {
  return `${short(b.start, calendar)} – ${short(b.end, calendar)}`;
}

/** "Nov 3" (or the Ethiopian day) for a period boundary. */
function short(day: string, calendar: CalendarPref) {
  if (calendar === "ethiopian") return formatDayString(day, calendar);
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}
