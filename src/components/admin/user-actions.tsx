"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteUser, setUserAdmin, suspendUser, unsuspendUser } from "@/actions/admin";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Pending = null | "suspend" | "admin" | "delete";

const DURATIONS = [
  { value: "1d", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "forever", label: "Until I lift it" },
] as const;

/** Suspend / lift, admin access, delete. Admins must lose admin access before the first and last. */
export function UserActions({
  userId,
  email,
  isAdmin,
  suspended,
}: {
  userId: string;
  email: string;
  isAdmin: boolean;
  suspended: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<Pending>(null);
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]["value"]>("7d");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string, after?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setDialog(null);
      setConfirmEmail("");
      if (result.ok) {
        setMessage({ tone: "ok", text: done });
        if (after) after();
        else router.refresh();
      } else {
        setMessage({ tone: "error", text: result.message });
      }
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">{suspended ? "Suspended" : "Suspend"}</p>
          <p className="text-sm text-ink-soft">
            {suspended
              ? "They can't sign in. Their data is untouched."
              : "Stops them signing in; keeps everything they made. An open session ends within the hour."}
          </p>
        </div>
        {suspended ? (
          <button type="button" className="btn btn-ghost shrink-0" disabled={isPending} onClick={() => run(() => unsuspendUser(userId), "Suspension lifted.")}>
            Lift suspension
          </button>
        ) : (
          <button type="button" className="btn btn-ghost shrink-0" disabled={isPending || isAdmin} onClick={() => setDialog("suspend")}>
            Suspend…
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t-2 border-mint pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">Admin access</p>
          <p className="text-sm text-ink-soft">
            {isAdmin ? "They can open this panel and manage every account." : "Lets them open this panel and manage every account."}
          </p>
        </div>
        <button type="button" className="btn btn-ghost shrink-0" disabled={isPending} onClick={() => setDialog("admin")}>
          {isAdmin ? "Remove admin" : "Make admin"}
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t-2 border-mint pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-wax">Delete account</p>
          <p className="text-sm text-ink-soft">Removes the account, every letter, photo and countdown. No undo.</p>
        </div>
        <button type="button" className="btn shrink-0 bg-wax text-white hover:opacity-90" disabled={isPending || isAdmin} onClick={() => setDialog("delete")}>
          Delete…
        </button>
      </div>

      {isAdmin && <p className="text-sm text-muted">Remove their admin access first to suspend or delete them.</p>}
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm font-semibold ${message.tone === "error" ? "text-wax" : "text-accent"}`}>
          {message.text}
        </p>
      )}

      <ConfirmDialog
        open={dialog === "suspend"}
        title={`Suspend ${email}?`}
        confirmLabel="Suspend"
        tone="danger"
        pending={isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(() => suspendUser(userId, duration), "Suspended.")}
      >
        <p>They won&apos;t be able to sign in. Nothing of theirs is deleted.</p>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold text-ink-soft">For how long</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {DURATIONS.map((d) => (
              <label key={d.value} className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold ${duration === d.value ? "border-teal bg-mint text-ocean" : "border-line"}`}>
                <input type="radio" name="duration" value={d.value} checked={duration === d.value} onChange={() => setDuration(d.value)} className="accent-[var(--teal)]" />
                {d.label}
              </label>
            ))}
          </div>
        </fieldset>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "admin"}
        title={isAdmin ? `Remove ${email}'s admin access?` : `Make ${email} an admin?`}
        confirmLabel={isAdmin ? "Remove admin" : "Make admin"}
        tone={isAdmin ? "danger" : "primary"}
        pending={isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(() => setUserAdmin(userId, !isAdmin), isAdmin ? "Admin access removed." : "They're an admin now.")}
      >
        <p>
          {isAdmin
            ? "They'll lose access to this panel straight away."
            : "They'll see everyone's account list and feedback, and can suspend or delete accounts. They still can't read anyone's letters or see photos."}
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === "delete"}
        title="Delete this account for good?"
        confirmLabel="Delete forever"
        tone="danger"
        pending={isPending}
        confirmDisabled={confirmEmail.trim().toLowerCase() !== email.toLowerCase()}
        onCancel={() => {
          setDialog(null);
          setConfirmEmail("");
        }}
        onConfirm={() => run(() => deleteUser(userId, confirmEmail), "Deleted.", () => router.replace("/admin/users"))}
      >
        <p>Every letter, photo, video, countdown and setting of this account is deleted now. There is no undo.</p>
        <label htmlFor="confirm-delete-user" className="mt-4 block text-sm font-semibold text-ink-soft">
          Type <span className="font-bold break-all text-ink">{email}</span> to confirm
        </label>
        <input
          id="confirm-delete-user"
          type="text"
          autoComplete="off"
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          className="field mt-1.5"
        />
      </ConfirmDialog>
    </div>
  );
}
