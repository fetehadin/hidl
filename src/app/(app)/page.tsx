import Link from "next/link";
import { LiveCountdown } from "@/components/countdown/live-countdown";
import { DashboardCard } from "@/components/dashboard-card";
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
        {/* Primary countdown */}
        {!countdown ? (
          <DashboardCard eyebrow="deadlines" href="/countdown/new" linkLabel="Add a countdown" className="sm:col-span-2">
            <p className="font-display text-xl">No countdowns yet.</p>
            <p className="text-ink-soft">Add an exam with a target score, or any other deadline.</p>
          </DashboardCard>
        ) : countdownDone ? (
          <DashboardCard eyebrow={countdown.title} href="/countdown" linkLabel={countdown.kind === "exam" && countdown.actual_score === null ? "Enter your score" : "Open countdown"} className="sm:col-span-2">
            <p className="font-display text-4xl font-semibold text-accent">Done!</p>
            {countdown.kind === "exam" && (
              <p className="text-ink-soft">
                {countdown.actual_score === null
                  ? `Target was ${countdown.target_score} / ${countdown.max_score}.`
                  : `You scored ${countdown.actual_score} / ${countdown.max_score} (target ${countdown.target_score}).`}
              </p>
            )}
          </DashboardCard>
        ) : (
          <DashboardCard eyebrow={countdown.title} href="/countdown" linkLabel="Open countdown" className="sm:col-span-2">
            <LiveCountdown target={countdown.target_at} serverNow={now} variant="compact" />
            <p className="mt-1 text-ink-soft">
              {countdown.kind === "exam" ? (
                <>
                  Target{" "}
                  <strong className="font-display text-xl text-ink tabular-nums">
                    {countdown.target_score} / {countdown.max_score}
                  </strong>{" "}
                  ·{" "}
                </>
              ) : null}
              {formatInAppTz(countdown.target_at, "MMM d, yyyy")}
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
