"use client";

import { useActionState, useState } from "react";
import type { ReactNode } from "react";
import { type CountdownFormState, saveCountdown } from "@/actions/countdowns";
import { formatEthiopian } from "@/lib/ethiopian";
import { localToUtc } from "@/lib/time";

type Kind = "exam" | "deadline";
type Defaults = { id?: string; kind: Kind; title: string; target_local: string; target_score: string; max_score: string };

export function CountdownForm({ defaults, locked }: { defaults: Defaults; locked: boolean }) {
  const [state, action, pending] = useActionState<CountdownFormState, FormData>(saveCountdown, { status: "idle" });
  const [kind, setKind] = useState<Kind>(defaults.kind);
  const err = (k: string) => state.fieldErrors?.[k]?.[0];
  const v = { ...defaults, ...state.values } as Defaults;
  const [targetLocal, setTargetLocal] = useState(v.target_local);

  return (
    <form action={action} className="space-y-5">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {state.message && <p role="alert" className="rounded-control bg-accent-soft px-4 py-3">{state.message}</p>}

      <input type="hidden" name="kind" value={kind} />
      {locked ? (
        <p className="text-sm text-muted">
          {kind === "exam" ? "Exam, with a score" : "Deadline"} · can&apos;t be changed after it&apos;s created
        </p>
      ) : (
        <div>
          <p className="mb-1.5 block text-sm font-semibold text-ink-soft">Type</p>
          <div className="flex gap-2">
            <KindButton active={kind === "exam"} onClick={() => setKind("exam")}>
              Exam <span className="font-normal">· with a score</span>
            </KindButton>
            <KindButton active={kind === "deadline"} onClick={() => setKind("deadline")}>
              Deadline
            </KindButton>
          </div>
        </div>
      )}

      <Field id="title" label="Title" error={err("title")}>
        <input
          id="title"
          name="title"
          required
          maxLength={80}
          className="field"
          placeholder={kind === "exam" ? "National university entrance exam" : "Scholarship application deadline"}
          defaultValue={v.title}
        />
      </Field>

      <Field id="target_local" label="Date and time" hint="Addis Ababa time" error={err("target_local")}>
        <input
          id="target_local"
          name="target_local"
          type="datetime-local"
          required
          className="field"
          value={targetLocal}
          onChange={(e) => setTargetLocal(e.target.value)}
        />
        {targetLocal && <p className="mt-1.5 text-sm text-muted">Ethiopian calendar: {formatEthiopian(localToUtc(targetLocal))}</p>}
      </Field>

      {kind === "exam" && (
        <div className="grid grid-cols-2 gap-4">
          <Field id="target_score" label="Target score" error={err("target_score")}>
            <input
              id="target_score"
              name="target_score"
              type="number"
              inputMode="numeric"
              min={0}
              required
              className="field tabular-nums"
              placeholder="620"
              defaultValue={v.target_score}
            />
          </Field>
          <Field id="max_score" label="Max score" error={err("max_score")}>
            <input
              id="max_score"
              name="max_score"
              type="number"
              inputMode="numeric"
              min={1}
              required
              className="field tabular-nums"
              placeholder="700"
              defaultValue={v.max_score}
            />
          </Field>
        </div>
      )}

      <div className="flex justify-end border-t border-line pt-5">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function KindButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-control border px-3 py-2.5 text-sm font-semibold transition-colors ${
        active ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:border-accent"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ id, label, hint, error, children }: {
  id: string; label: string; hint?: string; error?: string; children: ReactNode;
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
