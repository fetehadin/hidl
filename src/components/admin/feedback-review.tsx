"use client";

import { useActionState, useState } from "react";
import { type FeedbackReviewState, reviewFeedback } from "@/actions/admin";
import { FEEDBACK_MESSAGE_MAX, FEEDBACK_STATUSES, FEEDBACK_STATUS_LABEL, type FeedbackStatus } from "@/lib/feedback";

/** Status picker plus a reply the sender sees on their /feedback page. */
export function FeedbackReview({ id, status, reply }: { id: string; status: FeedbackStatus; reply: string | null }) {
  const [state, action, pending] = useActionState<FeedbackReviewState, FormData>(reviewFeedback, { status: "idle" });
  const [replying, setReplying] = useState(Boolean(reply));

  return (
    <form action={action} className="mt-4 flex flex-col gap-3 border-t-2 border-mint pt-4">
      <input type="hidden" name="id" value={id} />
      {replying ? (
        <div>
          <label htmlFor={`reply-${id}`} className="mb-1.5 block text-sm font-semibold text-ink-soft">
            Reply <span className="font-normal text-muted">(they see this on their feedback page; leave empty to remove)</span>
          </label>
          <textarea id={`reply-${id}`} name="reply" rows={3} maxLength={FEEDBACK_MESSAGE_MAX} defaultValue={reply ?? ""} className="field" />
        </div>
      ) : (
        <button type="button" onClick={() => setReplying(true)} className="self-start text-sm font-bold text-accent hover:underline">
          + Write a reply
        </button>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`status-${id}`} className="mb-1.5 block text-sm font-semibold text-ink-soft">Status</label>
          <select id={`status-${id}`} name="status" defaultValue={status === "new" ? "in_progress" : status} className="field min-w-40 py-2">
            {FEEDBACK_STATUSES.map((s) => (
              <option key={s} value={s}>{FEEDBACK_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state.status === "saved" && <p role="status" className="text-sm font-semibold text-accent">Saved.</p>}
        {state.status === "error" && <p role="alert" className="text-sm text-wax">{state.message}</p>}
      </div>
    </form>
  );
}
