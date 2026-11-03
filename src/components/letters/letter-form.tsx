"use client";

import { addMonths, addYears } from "date-fns";
import { TZDate } from "@date-fns/tz";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { createLetter, type FormState } from "@/actions/letters";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Markdown } from "@/components/markdown";
import { useCalendarPref, useTimeZone } from "@/components/calendar-pref";
import { encryptBody } from "@/lib/e2ee";
import { formatEthiopian } from "@/lib/ethiopian";
import { formatInTz, localToUtc, timeZoneCity } from "@/lib/time";
import { useLetterKey } from "./letter-key";

export const DRAFT_KEY = "hidl:letter-draft";
const RECIPIENTS = ["Future me", "Me in five years", "Me in ten years", "Me on my next birthday", "Me, after the big day"];

function quickPick(kind: "1m" | "6m" | "1y", tz: string) {
  const base = new TZDate(Date.now(), tz);
  const d = kind === "1m" ? addMonths(base, 1) : kind === "6m" ? addMonths(base, 6) : addYears(base, 1);
  d.setHours(9, 0, 0, 0);
  return formatInTz(d, "yyyy-MM-dd'T'HH:mm", tz);
}

type Draft = { title: string; recipient: string; occasion: string; body: string; unlock_local: string };
const EMPTY: Draft = { title: "", recipient: "", occasion: "", body: "", unlock_local: "" };

function readDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function LetterForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createLetter, { status: "idle" });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [confirming, setConfirming] = useState(false);
  const [encrypting, setEncrypting] = useState(false);
  const [encryptError, setEncryptError] = useState<string | null>(null);
  const letterKey = useLetterKey();
  const formRef = useRef<HTMLFormElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    // Restore an unsent draft (per device only).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(readDraft());
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft]);

  const set = (k: keyof Draft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  const err = (k: string) => state.fieldErrors?.[k]?.[0];

  const timeZone = useTimeZone();
  const [minLocal] = useState(() => formatInTz(new Date(Date.now() + 5 * 60_000), "yyyy-MM-dd'T'HH:mm", timeZone));
  const unlockUtc = draft.unlock_local ? localToUtc(draft.unlock_local, timeZone) : null;
  const unlockLabel = unlockUtc ? formatInTz(unlockUtc, "EEEE, MMMM d, yyyy 'at' h:mm a", timeZone) : "";
  const calendar = useCalendarPref();
  const unlockEthiopian = unlockUtc && calendar === "ethiopian" ? formatEthiopian(unlockUtc, timeZone) : "";

  function askToSeal() {
    if (formRef.current?.reportValidity()) setConfirming(true);
  }

  /**
   * Encrypts the letter text on this device, then sends the form with the ciphertext as
   * `body`. The textarea has no `name`, so the plain text is never part of a submission.
   */
  async function seal() {
    setConfirming(false);
    const form = formRef.current;
    if (!form) return;
    setEncryptError(null);
    setEncrypting(true);
    try {
      const fd = new FormData(form);
      fd.set("body", await encryptBody(letterKey, draft.body.trim()));
      startTransition(() => action(fd));
    } catch {
      setEncryptError("Couldn't encrypt the letter on this device. Try again.");
    } finally {
      setEncrypting(false);
    }
  }

  const busy = pending || encrypting;
  const message = encryptError ?? state.message;

  return (
    <form
      ref={formRef}
      className="space-y-5"
      onSubmit={(e) => {
        // Enter in a field goes through the confirm step; sealing itself is done by seal().
        e.preventDefault();
        askToSeal();
      }}
    >
      {message && (
        <p role="alert" className="rounded-control bg-accent-soft px-4 py-3 text-ink">
          {message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="For" id="recipient" error={err("recipient")}>
          <input id="recipient" name="recipient" list="recipients" required maxLength={60} className="field"
            placeholder="Future me" value={draft.recipient} onChange={set("recipient")} />
          <datalist id="recipients">
            {RECIPIENTS.map((r) => <option key={r} value={r} />)}
          </datalist>
        </Field>
        <Field label="Occasion" hint="optional" id="occasion" error={err("occasion")}>
          <input id="occasion" name="occasion" maxLength={80} className="field" placeholder="A new job"
            value={draft.occasion} onChange={set("occasion")} />
        </Field>
      </div>

      <Field label="Title" id="title" error={err("title")}>
        <input id="title" name="title" required maxLength={120} className="field"
          placeholder="Read this when you've made it" value={draft.title} onChange={set("title")} />
      </Field>

      <div>
        <div className="mb-1.5 flex items-end justify-between">
          <label htmlFor="body" className="text-sm font-semibold text-ink-soft">Letter</label>
          <div role="tablist" aria-label="Editor mode" className="flex rounded-control border border-line p-0.5 text-sm">
            {(["write", "preview"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`rounded-control px-3 py-1 capitalize ${tab === t ? "bg-accent-soft font-semibold" : "text-muted"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <textarea id="body" required maxLength={50000} rows={12}
          className={`field letter-paper prose-letter min-h-72 resize-y px-4 py-[1.4rem] ${tab === "preview" ? "sr-only" : ""}`}
          placeholder={"Dear me,\n\nBy the time you read this…"} value={draft.body} onChange={set("body")}
          aria-invalid={Boolean(err("body"))} />
        {tab === "preview" && (
          <div className="letter-paper min-h-72 px-4 py-[1.4rem]">
            {draft.body.trim() ? <Markdown>{draft.body}</Markdown> : <p className="text-muted">Nothing to preview yet.</p>}
          </div>
        )}
        <p className="mt-1.5 text-sm text-muted">
          Markdown works: **bold**, *italic*, lists, &gt; quotes. Your draft is kept on this device until you seal it,
          then it&apos;s encrypted here before it&apos;s sent: only you can read it.
        </p>
        {err("body") && <p className="mt-1 text-sm text-wax">{err("body")}</p>}
      </div>

      <Field label="Opens on" hint={`${timeZoneCity(timeZone)} time`} id="unlock_local" error={err("unlock_local")}>
        <div className="mb-2 flex flex-wrap gap-2">
          {([["1m", "In a month"], ["6m", "In 6 months"], ["1y", "In a year"]] as const).map(([k, label]) => (
            <button key={k} type="button" className="rounded-full border border-line px-3 py-1 text-sm hover:bg-paper-deep"
              onClick={() => setDraft((d) => ({ ...d, unlock_local: quickPick(k, timeZone) }))}>
              {label}
            </button>
          ))}
        </div>
        <input id="unlock_local" name="unlock_local" type="datetime-local" required min={minLocal}
          className="field" value={draft.unlock_local} onChange={set("unlock_local")} />
        {unlockEthiopian && <p className="mt-1.5 text-sm text-muted">Ethiopian calendar: {unlockEthiopian}</p>}
      </Field>

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">Once sealed, it can&apos;t be edited or opened early.</p>
        <button type="button" className="btn btn-primary" onClick={askToSeal} disabled={busy}>
          {encrypting ? "Encrypting…" : pending ? "Sealing…" : "Seal letter"}
        </button>
      </div>

      <ConfirmDialog open={confirming} title="Seal this letter?" confirmLabel="Seal it"
        cancelLabel="Keep writing" onConfirm={seal} onCancel={() => setConfirming(false)}>
        You won&apos;t be able to read or edit it until{" "}
        {unlockEthiopian ? (
          <>
            <strong className="text-ink">{unlockEthiopian}</strong> ({unlockLabel})
          </>
        ) : (
          <strong className="text-ink">{unlockLabel}</strong>
        )}
        . You can still push the date later or delete it.
      </ConfirmDialog>
    </form>
  );
}

function Field({ label, hint, id, error, children }: {
  label: string; hint?: string; id: string; error?: string; children: React.ReactNode;
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
