"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { ReactNode } from "react";
import { type CountdownFormState, saveCountdown } from "@/actions/countdowns";
import { type CountdownKind, type DetailField, KIND_INFO } from "@/lib/countdown-kinds";
import { formatEthiopian } from "@/lib/ethiopian";
import { localToUtc } from "@/lib/time";
import { detailField } from "@/lib/validation/countdown";
import { KindBadge } from "./kind-icon";

type Defaults = {
  id?: string;
  kind: CountdownKind;
  title: string;
  target_local: string;
  target_score: string;
  max_score: string;
  /** Detail values keyed by detail name (not form field name). */
  details: Record<string, string>;
};

export function CountdownForm({ defaults, locked }: { defaults: Defaults; locked: boolean }) {
  const [state, action, pending] = useActionState<CountdownFormState, FormData>(saveCountdown, { status: "idle" });
  const kind = defaults.kind;
  const info = KIND_INFO[kind];
  const err = (k: string) => state.fieldErrors?.[k]?.[0];
  const v = { ...defaults, ...state.values } as Defaults & Record<string, string>;
  const detailValue = (name: string) => state.values?.[detailField(name)] ?? defaults.details[name] ?? "";
  const [targetLocal, setTargetLocal] = useState(v.target_local);
  const textFields = info.fields.filter((f) => f.type !== "note");
  const noteField = info.fields.find((f) => f.type === "note");

  return (
    <form action={action} className="space-y-5">
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {state.message && <p role="alert" className="rounded-control bg-accent-soft px-4 py-3">{state.message}</p>}

      <input type="hidden" name="kind" value={kind} />
      <div className="flex items-center gap-3 rounded-control bg-mint/50 px-3 py-2.5">
        <KindBadge kind={kind} size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight font-semibold text-heading">{info.label}</p>
          <p className="text-sm text-muted">
            {locked ? "The type can't be changed after it's created" : info.blurb}
          </p>
        </div>
        {!locked && (
          <Link href="/countdown/new" className="rounded-control px-2 py-1.5 text-sm font-semibold text-accent hover:bg-white">
            Change
          </Link>
        )}
      </div>

      <Field id="title" label="Title" error={err("title")}>
        <input
          id="title"
          name="title"
          required
          maxLength={80}
          className="field"
          placeholder={info.titlePlaceholder}
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

      {textFields.length > 0 && (
        <div className={`grid gap-4 ${textFields.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {textFields.map((f) => (
            <DetailInput key={f.name} field={f} value={detailValue(f.name)} error={err(detailField(f.name))} />
          ))}
        </div>
      )}

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

      {noteField && <DetailInput field={noteField} value={detailValue(noteField.name)} error={err(detailField(noteField.name))} />}

      <div className="flex justify-end border-t border-line pt-5">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function DetailInput({ field, value, error }: { field: DetailField; value: string; error?: string }) {
  const id = detailField(field.name);
  const hint = field.required ? undefined : "optional";
  return (
    <Field id={id} label={field.label} hint={hint} error={error}>
      {field.type === "note" ? (
        <textarea id={id} name={id} rows={2} maxLength={200} className="field resize-y" placeholder={field.placeholder} defaultValue={value} />
      ) : (
        <input
          id={id}
          name={id}
          required={field.required}
          maxLength={field.type === "year" ? 4 : 80}
          inputMode={field.type === "year" ? "numeric" : undefined}
          pattern={field.type === "year" ? "[0-9]{4}" : undefined}
          className={`field ${field.type === "year" ? "tabular-nums" : ""}`}
          placeholder={field.placeholder}
          defaultValue={value}
        />
      )}
    </Field>
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
