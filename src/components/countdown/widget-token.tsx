"use client";

import { useState, useTransition } from "react";
import { generateWidgetToken, revokeWidgetToken } from "@/actions/countdowns";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { publicEnv } from "@/lib/public-env";
import { useTimeZone } from "@/components/calendar-pref";
import { formatInTz } from "@/lib/time";
import { AppWidgetHelp } from "./app-widget-help";
import { useDevice } from "@/components/use-device";

/**
 * Home-screen widget help: the Android app first (AppWidgetHelp), then, under "Advanced", creating,
 * regenerating or removing a feed token for KWGT and the like. Without `countdown` it's the
 * account's "starred countdown" feed; with one, that countdown's own feed.
 */
export function WidgetToken({
  createdAt,
  countdown,
  bare = false,
}: {
  createdAt: string | null;
  countdown?: { id: string; title: string };
  /** Leave off the card chrome and intro (when shown inside a dialog). */
  bare?: boolean;
}) {
  const timeZone = useTimeZone();
  // Inside the phone app the widget is one tap; feed links for other widget apps would only clutter it.
  const inApp = useDevice() === "app";
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await generateWidgetToken(countdown?.id ?? null);
      if (!res.ok) return setError(res.message);
      setRevealedToken(res.token);
    });
  }

  function revoke() {
    startTransition(async () => {
      const res = await revokeWidgetToken(countdown?.id ?? null);
      setConfirmRevoke(false);
      if (!res.ok) return setError(res.message);
      setRevealedToken(null);
    });
  }

  const feedUrl = revealedToken ? `${publicEnv.NEXT_PUBLIC_SITE_URL}/api/widget/countdown?token=${revealedToken}` : null;

  return (
    <div className={bare ? "" : "card p-5 sm:p-6"}>
      {!bare && (
        <>
          <p className="eyebrow mb-1">home screen widget</p>
          <h2 className="font-display text-xl font-semibold">Your countdowns</h2>
        </>
      )}
      <div className={bare ? "" : "mt-3"}>
        <AppWidgetHelp title={countdown?.title} />
      </div>

      {!inApp && (
      <details className="mt-4" open={Boolean(revealedToken)}>
        <summary className="cursor-pointer text-sm font-semibold text-accent">Advanced: use KWGT or another widget app</summary>
        <p className="mt-2 text-ink-soft">
          A widget app like <strong>KWGT</strong> can show a countdown if you give it a feed URL to read. This makes that
          URL. It returns{" "}
          {countdown ? (
            <>
              only <strong>{countdown.title}</strong>
            </>
          ) : (
            "whichever one countdown you've starred"
          )}{" "}
          as JSON, never your letters or photos.
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
              <code>targetScore</code>, <code>maxScore</code>, <code>actualScore</code>, <code>details</code>,{" "}
              <code>done</code>, <code>daysLeft</code>, <code>units</code>, <code>remaining</code> (the time left in the
              countdown&apos;s chosen units, like <code>{"{"}&quot;months&quot;: 7, &quot;days&quot;: 13{"}"}</code>). <code>targetScore</code>/<code>maxScore</code>/<code>actualScore</code>{" "}
              are <code>null</code> for anything but an exam.
            </p>
          </div>
        ) : createdAt ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink-soft">
              A widget token was created on {formatInTz(createdAt, "MMM d, yyyy", timeZone)}. The URL itself was only shown
              once; if you&apos;ve lost it, regenerate.
            </p>
          </div>
        ) : null}

        {error && (
          <p role="alert" className="mt-3 rounded-control bg-accent-soft px-3 py-2 text-sm">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          {createdAt || revealedToken ? (
            <button type="button" className="btn btn-ghost" onClick={generate} disabled={pending}>
              {pending ? "Working…" : "Regenerate"}
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={generate} disabled={pending}>
              {pending ? "Creating…" : "Create a widget token"}
            </button>
          )}
          {(createdAt || revealedToken) && (
            <button type="button" className="text-sm font-semibold text-wax underline-offset-4 hover:underline" onClick={() => setConfirmRevoke(true)}>
              Remove
            </button>
          )}
        </div>
      </details>
      )}

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
