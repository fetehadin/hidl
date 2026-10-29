"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteCountdown, setWidgetCountdown } from "@/actions/countdowns";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PencilIcon, StarIcon, TrashIcon } from "@/components/icons";
import type { Countdown } from "@/lib/data/countdowns";
import { formatInAppTz } from "@/lib/time";
import { LiveCountdown } from "./live-countdown";
import { ScoreCompare } from "./score-compare";
import { ScoreForm } from "./score-form";

export function CountdownCard({ countdown, now, featured = false }: { countdown: Countdown; now: number; featured?: boolean }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const done = new Date(countdown.target_at).getTime() <= now;
  const when = formatInAppTz(countdown.target_at, "EEEE, MMMM d, yyyy 'at' h:mm a");

  function remove() {
    startTransition(async () => {
      const res = await deleteCountdown(countdown.id);
      setConfirmDelete(false);
      if (!res.ok) setError(res.message);
    });
  }

  function star() {
    setError(null);
    startTransition(async () => {
      const res = await setWidgetCountdown(countdown.id);
      if (!res.ok) setError(res.message);
    });
  }

  return (
    <div className={`card relative p-5 sm:p-6 ${featured ? "card-interactive" : ""}`}>
      <button
        type="button"
        onClick={star}
        disabled={pending}
        aria-pressed={countdown.is_widget}
        aria-label={countdown.is_widget ? "Shown on your widget. Tap to unstar" : "Star to show this on your widget"}
        title={countdown.is_widget ? "Shown on your widget" : "Show this on your widget"}
        className={`absolute top-3 right-3 flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors ${
          countdown.is_widget ? "text-accent" : "text-muted hover:text-ink"
        }`}
      >
        <StarIcon width={22} height={22} filled={countdown.is_widget} strokeWidth={1.5} />
      </button>

      <div className={`flex flex-col gap-4 pr-11 ${featured ? "sm:flex-row sm:items-center sm:justify-between sm:gap-8" : ""}`}>
        <div className="min-w-0">
          <p className="eyebrow">{done ? "it's over" : countdown.kind === "exam" ? "the big day" : "deadline"}</p>
          <h2 className={`font-display font-semibold tracking-tight ${featured ? "text-2xl sm:text-3xl" : "text-xl"}`}>
            {countdown.title}
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">{when}</p>

          {!done && countdown.kind === "exam" && (
            <p className="mt-3">
              <span className="block text-sm font-semibold text-ink-soft">Target score</span>
              <strong className={`font-display tabular-nums text-ink ${featured ? "text-2xl" : "text-xl"}`}>
                {countdown.target_score}
              </strong>
              <span className="text-muted"> / {countdown.max_score}</span>
            </p>
          )}
        </div>

        {!done && (
          <div className={featured ? "shrink-0 self-start sm:self-center" : "shrink-0"}>
            <LiveCountdown target={countdown.target_at} serverNow={now} variant="compact" />
          </div>
        )}
      </div>

      {done && (
        <div className="mt-4 space-y-4">
          <p className="font-display text-3xl font-semibold text-accent">Done!</p>
          {countdown.kind === "exam" && countdown.max_score !== null && countdown.target_score !== null && (
            <>
              {countdown.actual_score !== null && (
                <ScoreCompare actual={countdown.actual_score} target={countdown.target_score} max={countdown.max_score} />
              )}
              <ScoreForm countdownId={countdown.id} max={countdown.max_score} current={countdown.actual_score} />
            </>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-wax">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
        <Link
          href={`/countdown/${countdown.id}/edit`}
          className="flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-semibold text-accent hover:bg-accent-soft"
        >
          <PencilIcon width={17} height={17} />
          Edit
        </Link>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-semibold text-wax hover:bg-accent-soft"
        >
          <TrashIcon width={17} height={17} />
          Delete
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title={`Delete "${countdown.title}"?`}
        confirmLabel="Delete forever"
        pending={pending}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      >
        There&apos;s no undo.
      </ConfirmDialog>
    </div>
  );
}
