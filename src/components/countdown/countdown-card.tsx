"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteCountdown, setWidgetCountdown } from "@/actions/countdowns";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { Countdown } from "@/lib/data/countdowns";
import { formatInAppTz } from "@/lib/time";
import { LiveCountdown } from "./live-countdown";
import { ScoreCompare } from "./score-compare";
import { ScoreForm } from "./score-form";

export function CountdownCard({ countdown, now }: { countdown: Countdown; now: number }) {
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
    <div className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{done ? "it's over" : countdown.kind === "exam" ? "the big day" : "deadline"}</p>
          <h2 className="font-display text-2xl font-semibold">{countdown.title}</h2>
          <p className="text-sm text-ink-soft">{when}</p>
        </div>
        <button
          type="button"
          onClick={star}
          disabled={pending}
          aria-pressed={countdown.is_widget}
          aria-label={countdown.is_widget ? "Shown on your widget" : "Show this on your widget"}
          title={countdown.is_widget ? "Shown on your widget" : "Show this on your widget"}
          className={`shrink-0 rounded-full px-2 py-1 text-xl ${countdown.is_widget ? "text-accent" : "text-muted hover:text-ink"}`}
        >
          {countdown.is_widget ? "★" : "☆"}
        </button>
      </div>

      {!done ? (
        <div className="mt-4">
          <LiveCountdown target={countdown.target_at} serverNow={now} variant="compact" />
          {countdown.kind === "exam" && (
            <p className="mt-2 text-ink-soft">
              Target{" "}
              <strong className="text-ink tabular-nums">
                {countdown.target_score} / {countdown.max_score}
              </strong>
            </p>
          )}
        </div>
      ) : (
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

      <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-sm">
        <Link href={`/countdown/${countdown.id}/edit`} className="font-semibold text-accent underline-offset-4 hover:underline">
          Edit
        </Link>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="font-semibold text-wax underline-offset-4 hover:underline"
        >
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
