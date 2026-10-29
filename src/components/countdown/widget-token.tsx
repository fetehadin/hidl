"use client";

import { useState, useTransition } from "react";
import { generateWidgetToken, revokeWidgetToken } from "@/actions/countdowns";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { publicEnv } from "@/lib/env";
import { formatInAppTz } from "@/lib/time";

export function WidgetToken({ createdAt }: { createdAt: string | null }) {
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await generateWidgetToken();
      if (!res.ok) return setError(res.message);
      setRevealedToken(res.token);
    });
  }

  function revoke() {
    startTransition(async () => {
      const res = await revokeWidgetToken();
      setConfirmRevoke(false);
      if (!res.ok) return setError(res.message);
      setRevealedToken(null);
    });
  }

  const feedUrl = revealedToken ? `${publicEnv.NEXT_PUBLIC_SITE_URL}/api/widget/countdown?token=${revealedToken}` : null;

  return (
    <div className="card p-5 sm:p-6">
      <p className="eyebrow mb-1">home screen widget</p>
      <h2 className="font-display text-xl font-semibold">Countdown on your lock screen</h2>
      <p className="mt-1 text-ink-soft">
        A web app can&apos;t place a live widget on Android&apos;s home screen by itself — but a widget app like{" "}
        <strong>KWGT</strong> can, if you give it a feed URL to read. This generates that URL. It returns whichever
        one countdown you&apos;ve starred below as JSON — never your letters or photos.
      </p>

      {feedUrl ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-semibold text-sage">
            Copy this now — it won&apos;t be shown again. Paste it into KWGT&apos;s &quot;Web&quot; source for a text or
            number module.
          </p>
          <div className="flex gap-2">
            <input readOnly value={feedUrl} onFocus={(e) => e.target.select()} className="field font-mono text-xs" />
            <button
              type="button"
              className="btn btn-ghost shrink-0"
              onClick={() => navigator.clipboard.writeText(feedUrl)}
            >
              Copy
            </button>
          </div>
          <p className="text-sm text-muted">
            Fields in the response: <code>kind</code>, <code>title</code>, <code>targetAt</code>,{" "}
            <code>targetScore</code>, <code>maxScore</code>, <code>actualScore</code>, <code>done</code>,{" "}
            <code>daysLeft</code>. <code>targetScore</code>/<code>maxScore</code>/<code>actualScore</code> are
            <code>null</code> for a plain deadline.
          </p>
        </div>
      ) : createdAt ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-soft">
            A widget token was created on {formatInAppTz(createdAt, "MMM d, yyyy")}. The URL itself was only shown
            once; if you&apos;ve lost it, regenerate.
          </p>
        </div>
      ) : null}

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {createdAt || revealedToken ? (
          <button type="button" className="btn btn-ghost" onClick={generate} disabled={pending}>
            {pending ? "Working…" : "Regenerate"}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={generate} disabled={pending}>
            {pending ? "Creating…" : "Create a widget token"}
          </button>
        )}
        {(createdAt || revealedToken) && (
          <button type="button" className="text-sm font-semibold text-wax underline-offset-4 hover:underline" onClick={() => setConfirmRevoke(true)}>
            Remove
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmRevoke}
        tone="danger"
        title="Remove the widget token?"
        confirmLabel="Remove"
        pending={pending}
        onConfirm={revoke}
        onCancel={() => setConfirmRevoke(false)}
      >
        Any widget using it will stop updating until you create a new one.
      </ConfirmDialog>
    </div>
  );
}
