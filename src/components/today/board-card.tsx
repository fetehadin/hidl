import Link from "next/link";
import { ArrowRightIcon, TrophyIcon } from "@/components/icons";
import { ProfileImage } from "@/components/profile/profile-image";
import type { LeaderboardRow } from "@/lib/data/leaderboard";

const RING = ["ring-gold", "ring-silver", "ring-bronze"];

/**
 * This week's leaderboard on Today: just your place and the top three faces (the details are on
 * /leaderboard). Before you have any XP it says how to get on the board.
 */
export function BoardCard({ rows, className = "" }: { rows: LeaderboardRow[]; className?: string }) {
  const mine = rows.find((r) => r.isMe);
  const top = rows.filter((r) => r.rank <= 3).slice(0, 3);

  return (
    <Link
      href="/leaderboard"
      className={`card card-interactive animate-fade-up flex items-center gap-3 px-3.5 py-3 sm:px-5 ${className}`}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold/20 text-heading">
        <TrophyIcon width={22} height={22} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        {mine ? (
          <span className="block font-display text-lg font-extrabold text-ink tabular-nums">
            #{mine.rank} <span className="text-sm font-bold text-muted">this week</span>
          </span>
        ) : (
          <>
            <span className="block font-display text-lg font-extrabold text-ink">Leaderboard</span>
            <span className="block truncate text-[13px] font-semibold text-ink-soft">Earn XP to join this week</span>
          </>
        )}
      </span>
      {top.length > 0 && (
        <span className="flex shrink-0 -space-x-2.5" aria-label="Top three this week">
          {top.map((r) => (
            <span key={r.rank} className={`rounded-full bg-white ring-[2.5px] ${RING[r.rank - 1]}`} title={`#${r.rank}`}>
              <ProfileImage avatar={r.avatar} size={32} />
            </span>
          ))}
        </span>
      )}
      <ArrowRightIcon width={16} height={16} className="shrink-0 text-muted" />
    </Link>
  );
}
