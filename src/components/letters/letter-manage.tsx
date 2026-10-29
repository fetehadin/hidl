"use client";

import { useActionState, useRef, useState } from "react";
import { deleteLetter, type FormState, postponeLetter } from "@/actions/letters";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function PostponeForm({ id, currentLocal }: { id: string; currentLocal: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(postponeLetter, { status: "idle" });

  return (
    <details className="group rounded-control border border-line px-4 py-3">
      <summary className="cursor-pointer list-none font-semibold text-ink-soft marker:hidden">
        Move the date later <span className="text-muted group-open:hidden">→</span>
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="id" value={id} />
        <label htmlFor="unlock_local" className="sr-only">New opening date</label>
        <input id="unlock_local" name="unlock_local" type="datetime-local" required min={currentLocal}
          defaultValue={state.values?.unlock_local ?? currentLocal} className="field" />
        <button type="submit" className="btn btn-ghost shrink-0" disabled={pending}>
          {pending ? "Saving…" : "Push it back"}
        </button>
      </form>
      {state.message && (
        <p role={state.status === "error" ? "alert" : "status"}
          className={`mt-2 text-sm ${state.status === "error" ? "text-wax" : "text-sage"}`}>
          {state.message}
        </p>
      )}
      <p className="mt-2 text-sm text-muted">The date can only move later, never earlier.</p>
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
