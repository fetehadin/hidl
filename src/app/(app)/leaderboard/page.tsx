import type { Metadata } from "next";
import Link from "next/link";
import { FlameIcon } from "@/components/icons";
import { PageHeader } from "@/components/page-header";
import { ProfileImage } from "@/components/profile/profile-image";
import { formatDayString } from "@/lib/admin-format";
import type { CalendarPref } from "@/lib/dates";
import { type LeaderboardPeriod, type LeaderboardRow, getLeaderboard } from "@/lib/data/leaderboard";
import { getProfile } from "@/lib/data/profile";
import { pictureUrl } from "@/lib/profile-rules";
import { publicEnv } from "@/lib/public-env";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Leaderboard" };

const NO_NAME = "A hidl friend";
const LABEL: Record<LeaderboardPeriod, { now: string; last: string }> = {
  week: { now: "This week", last: "Last week" },
  month: { now: "This month", last: "Last month" },
};
const MEDAL = ["🥇", "🥈", "🥉"];

/**
 * Who kept the longest photo streak this week or month (leaderboard() in
 * ..._profiles_leaderboard.sql). Below the live board: the released results of the last period.
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
  const mineLast = last.rows.find((r) => r.isMe);
  const range = (b: { start: string; end: string }) => `${short(b.start, calendar)} – ${short(b.end, calendar)}`;

  return (
    <>
      <PageHeader eyebrow="leaderboard" title="Photo streaks" />
      <p className="-mt-3 mb-5 max-w-2xl text-ink-soft">
        Who added a photo on the most days in a row. Only a photo added <em>on</em> its day counts, so filling in old days
        won&apos;t move you up.
      </p>

      <nav aria-label="Period" className="mb-5 flex gap-1.5">
        {(["week", "month"] as const).map((p) => (
          <Link
            key={p}
            href={`/leaderboard?period=${p}`}
            aria-current={p === period ? "page" : undefined}
            className={`rounded-full border-2 px-4 py-2 text-sm font-bold ${p === period ? "border-teal bg-mint text-ocean" : "border-line bg-white text-muted hover:text-ocean"}`}
          >
            {LABEL[p].now}
          </Link>
        ))}
      </nav>

      {!me.showOnLeaderboard ? (
        <Notice>
          You&apos;re hidden from the leaderboard. <Link href="/account#profile" className="font-bold text-accent">Show me again</Link>
        </Notice>
      ) : !me.displayName ? (
        <Notice>
          You show up as &ldquo;{NO_NAME}&rdquo;. <Link href="/account#profile" className="font-bold text-accent">Pick a display name</Link>{" "}
          so people know it&apos;s you.
        </Notice>
      ) : null}

      <section aria-labelledby="now" className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="now" className="font-display text-xl font-semibold">{LABEL[period].now}</h2>
          <p className="text-sm text-muted">{range(board)}</p>
        </div>
        {me.showOnLeaderboard && (
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            {mine ? (
              <>You&apos;re <span className="text-heading">#{mine.rank}</span> with {days(mine.streak)} in a row.</>
            ) : (
              <>
                You&apos;re not on the board yet.{" "}
                <Link href="/calendar?add=today" className="text-accent">Add today&apos;s photo</Link> to start a streak.
              </>
            )}
          </p>
        )}

        {board.rows.length === 0 ? (
          <p className="mt-6 rounded-2xl border-2 border-dashed border-line p-6 text-center text-ink-soft">
            Nobody has a streak yet. Add today&apos;s photo and you&apos;re first.
          </p>
        ) : (
          <ol className="mt-4 flex flex-col gap-2">
            {board.rows.map((r) => (
              <Row key={`${r.rank}-${r.displayName}-${r.isMe}`} row={r} />
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="last" className="card mt-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="last" className="font-display text-xl font-semibold">{LABEL[period].last}&apos;s results</h2>
          <p className="text-sm text-muted">{range(last)} · final</p>
        </div>
        {last.rows.length === 0 ? (
          <p className="mt-3 text-ink-soft">No streaks were recorded.</p>
        ) : (
          <>
            <ol className="mt-4 grid gap-2 sm:grid-cols-3">
              {last.rows
                .filter((r) => r.rank <= 3)
                .map((r) => (
                  <li key={`${r.rank}-${r.displayName}`} className={`flex items-center gap-3 rounded-2xl border-2 p-3 ${r.isMe ? "border-teal bg-mint" : "border-line"}`}>
                    <span aria-hidden className="text-2xl">{MEDAL[r.rank - 1]}</span>
                    <Face row={r} size={40} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.displayName ?? NO_NAME}{r.isMe && " (you)"}</span>
                      <span className="text-sm text-muted">{days(r.streak)}</span>
                    </span>
                  </li>
                ))}
            </ol>
            {mineLast && mineLast.rank > 3 && (
              <p className="mt-3 text-sm text-ink-soft">You finished #{mineLast.rank} with {days(mineLast.streak)} in a row.</p>
            )}
          </>
        )}
      </section>
    </>
  );
}

function Row({ row }: { row: LeaderboardRow }) {
  return (
    <li
      className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 ${row.isMe ? "border-teal bg-mint" : "border-transparent bg-white/60"}`}
      aria-current={row.isMe ? "true" : undefined}
    >
      <span className="w-9 shrink-0 text-center font-display text-lg font-semibold text-heading tabular-nums">
        {row.rank <= 3 ? <span aria-label={`Rank ${row.rank}`}>{MEDAL[row.rank - 1]}</span> : `#${row.rank}`}
      </span>
      <Face row={row} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">
          {row.displayName ?? NO_NAME}
          {row.isMe && <span className="text-muted"> (you)</span>}
        </span>
        <span className="block text-xs leading-snug text-muted">{days(row.photoDays)} with an on-time photo</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 font-display text-xl font-semibold text-heading tabular-nums" title={`${days(row.streak)} in a row`}>
        <FlameIcon width={18} height={18} className="text-wax" />
        {row.streak}
      </span>
    </li>
  );
}

function Face({ row, size }: { row: LeaderboardRow; size: number }) {
  const src = row.picturePath ? pictureUrl(publicEnv.NEXT_PUBLIC_SUPABASE_URL, row.picturePath) : null;
  return <ProfileImage pictureSrc={src} avatar={row.avatar} size={size} className="ring-2 ring-aqua" />;
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 rounded-2xl border-2 border-aqua bg-white/70 px-4 py-3 text-sm text-ink-soft">{children}</p>;
}

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/** "Nov 3" (or the Ethiopian day) for a period boundary. */
function short(day: string, calendar: CalendarPref) {
  if (calendar === "ethiopian") return formatDayString(day, calendar);
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}
