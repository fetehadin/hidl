"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deleteLetter, type FormState, changeLetterDate } from "@/actions/letters";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useCalendarPref, useTimeZone } from "@/components/calendar-pref";
import { formatEthiopian } from "@/lib/ethiopian";
import { localToUtc, utcToLocalInput } from "@/lib/time";

/** Change the opening date of a sealed letter: earlier or later, as long as it's still ahead. */
export function ChangeDateForm({ id, currentLocal }: { id: string; currentLocal: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeLetterDate, { status: "idle" });
  const [value, setValue] = useState(state.values?.unlock_local ?? currentLocal);
  const calendar = useCalendarPref();
  const timeZone = useTimeZone();
  // The earliest allowed is "a minute from now", worked out in the browser after it loads (the
  // server checks it again). Rendering it on the server could disagree with the client's minute.
  const [minLocal, setMinLocal] = useState<string>();
  useEffect(() => {
    const update = () => setMinLocal(utcToLocalInput(new Date(Date.now() + 60_000), timeZone));
    update();
    const t = setInterval(update, 30_000);
    return () => clearInterval(t);
  }, [timeZone]);

  return (
    <details className="group rounded-control border border-line px-4 py-3">
      <summary className="cursor-pointer list-none font-semibold text-ink-soft marker:hidden">
        Change the opening date <span className="text-muted group-open:hidden">→</span>
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="id" value={id} />
        <label htmlFor="unlock_local" className="sr-only">New opening date</label>
        <input id="unlock_local" name="unlock_local" type="datetime-local" required min={minLocal}
          value={value} onChange={(e) => setValue(e.target.value)} className="field" />
        <button type="submit" className="btn btn-ghost shrink-0" disabled={pending || value === currentLocal}>
          {pending ? "Saving…" : "Save date"}
        </button>
      </form>
      {value && calendar === "ethiopian" && <p className="mt-1.5 text-sm text-muted">Ethiopian calendar: {formatEthiopian(localToUtc(value, timeZone), timeZone)}</p>}
      {state.message && (
        <p role={state.status === "error" ? "alert" : "status"}
          className={`mt-2 text-sm ${state.status === "error" ? "text-wax" : "text-sage"}`}>
          {state.message}
        </p>
      )}
      <p className="mt-2 text-sm text-muted">
        Earlier or later, any time while it&apos;s still sealed. It stays sealed until the new date.
      </p>
    </details>
  );
}

export function DeleteLetterButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={deleteLetter}>
        <input type="hidden" name="id" value={id} />
      </form>
      <button type="button" onClick={() => setOpen(true)}
        className="text-sm font-semibold text-wax underline-offset-4 hover:underline">
        Delete letter
      </button>
      <ConfirmDialog open={open} tone="danger" title="Delete this letter?" confirmLabel="Delete forever"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setPending(true);
          formRef.current?.requestSubmit();
        }}>
        It will be gone for good. There&apos;s no undo.
      </ConfirmDialog>
    </>
  );
}
