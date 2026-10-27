"use client";

import { useActionState } from "react";
import { type ExamFormState, saveExamSettings } from "@/actions/exam";

type Defaults = { exam_name: string; exam_local: string; target_score: string; max_score: string };

export function ExamSettingsForm({ defaults }: { defaults: Defaults }) {
  const [state, action, pending] = useActionState<ExamFormState, FormData>(saveExamSettings, { status: "idle" });
  const err = (k: string) => state.fieldErrors?.[k]?.[0];
  const v = { ...defaults, ...state.values } as Defaults;

  return (
    <form action={action} className="space-y-5">
      {state.message && <p role="alert" className="rounded-xl bg-accent-soft px-4 py-3">{state.message}</p>}

      <Field id="exam_name" label="Exam" error={err("exam_name")}>
        <input id="exam_name" name="exam_name" required maxLength={80} className="field"
          placeholder="National university entrance exam" defaultValue={v.exam_name} />
      </Field>

      <Field id="exam_local" label="Date and time" hint="Addis Ababa time" error={err("exam_local")}>
        <input id="exam_local" name="exam_local" type="datetime-local" required className="field"
          defaultValue={v.exam_local} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field id="target_score" label="Target score" error={err("target_score")}>
          <input id="target_score" name="target_score" type="number" inputMode="numeric" min={0} required
            className="field tabular-nums" placeholder="620" defaultValue={v.target_score} />
        </Field>
        <Field id="max_score" label="Max score" error={err("max_score")}>
          <input id="max_score" name="max_score" type="number" inputMode="numeric" min={1} required
            className="field tabular-nums" placeholder="700" defaultValue={v.max_score} />
        </Field>
      </div>

      <div className="flex justify-end border-t border-line pt-5">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function Field({ id, label, hint, error, children }: {
  id: string; label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-soft">
        {label} {hint && <span className="font-normal text-muted">· {hint}</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-sm text-wax">{error}</p>}
    </div>
  );
}
