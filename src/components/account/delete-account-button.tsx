"use client";

import { useRef, useState } from "react";
import { deleteAccount } from "@/actions/auth";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={deleteAccount} />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn bg-wax text-white hover:opacity-90"
      >
        Delete my account
      </button>
      <ConfirmDialog
        open={open}
        tone="danger"
        title="Delete your account?"
        confirmLabel="Delete forever"
        pending={pending}
        confirmDisabled={confirmText !== "DELETE"}
        onCancel={() => {
          setOpen(false);
          setConfirmText("");
        }}
        onConfirm={() => {
          setPending(true);
          formRef.current?.requestSubmit();
        }}
      >
        <p>
          Every letter, photo, and setting on this account is deleted immediately and permanently. There is no undo
          and no grace period.
        </p>
        <label htmlFor="confirm-delete" className="mt-4 block text-sm font-semibold text-ink-soft">
          Type DELETE to confirm
        </label>
        <input
          id="confirm-delete"
          type="text"
          autoComplete="off"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="field mt-1.5"
        />
      </ConfirmDialog>
    </>
  );
}
