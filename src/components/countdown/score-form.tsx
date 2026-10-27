"use client";

import { useActionState } from "react";
import { type ExamFormState, saveActualScore } from "@/actions/exam";

export function ScoreForm({ max, current }: { max: number; current: number | null }) {
  const [state, action, pending] = useActionState<ExamFormState, FormData>(saveActualScore, { status: "idle" });
  const error = state.fieldErrors?.actual_score?.[0] ?? (state.status === "error" ? state.message : undefined);

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="actual_score" className="mb-1.5 block text-sm font-semibold text-ink-soft">
          {current === null ? "How did it go? Enter your score" : "Update your score"}
        </label>
        <div className="flex items-center gap-2">
          <input id="actual_score" name="actual_score" type="number" inputMode="numeric" min={0} max={max} required
            defaultValue={state.values?.actual_score ?? current ?? undefined} className="field max-w-40 text-lg tabular-nums"
            aria-invalid={Boolean(error)} aria-describedby={error ? "score-error" : undefined} />
          <span className="text-ink-soft">/ {max}</span>
        </div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save score"}
      </button>
      {error && <p id="score-error" role="alert" className="text-sm text-wax sm:basis-full">{error}</p>}
    </form>
  );
}
