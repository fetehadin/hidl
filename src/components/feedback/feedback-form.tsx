"use client";

import { useActionState, useState } from "react";
import { type FeedbackFormState, sendFeedback } from "@/actions/feedback";
import { FEEDBACK_KINDS, FEEDBACK_KIND_LABEL, FEEDBACK_MESSAGE_MAX, type FeedbackKind } from "@/lib/feedback";

/**
 * Sends feedback to the admins. `from` is the page the person came from (the nav link adds it),
 * so a bug report says where it happened.
 */
export function FeedbackForm({ from }: { from?: string }) {
  // Remounting the form is how "send something else" starts over from a clean action state.
  const [round, setRound] = useState(0);
  return <Form key={round} from={from} onAgain={() => setRound((r) => r + 1)} />;
}

function Form({ from, onAgain }: { from?: string; onAgain: () => void }) {
  const [state, action, pending] = useActionState<FeedbackFormState, FormData>(sendFeedback, { status: "idle" });
  const [kind, setKind] = useState<FeedbackKind>((state.values?.kind as FeedbackKind) || "idea");
  const [length, setLength] = useState(0);
  const messageError = state.fieldErrors?.message?.[0];
  const kindError = state.fieldErrors?.kind?.[0];

  if (state.status === "sent") {
    return (
      <div role="status" className="rounded-2xl border-2 border-teal bg-mint p-5 text-center">
        <p className="font-display text-xl font-semibold text-ocean">Thank you! It&apos;s on its way.</p>
        <p className="mt-1 text-sm text-ink-soft">If there&apos;s a reply, you&apos;ll find it below.</p>
        <button type="button" onClick={onAgain} className="mt-3 text-sm font-bold text-accent hover:underline">
          Send something else
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="page" value={from ?? ""} />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink-soft">What is it about?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FEEDBACK_KINDS.map((k) => (
            <label
              key={k}
              className={`flex min-h-12 cursor-pointer items-center justify-center rounded-2xl border-2 px-3 py-2 text-center text-sm font-bold transition-colors ${
                kind === k ? "border-teal bg-mint text-ocean" : "border-line bg-white text-muted hover:text-ocean"
              }`}
            >
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {FEEDBACK_KIND_LABEL[k]}
            </label>
          ))}
        </div>
        {kindError && <p role="alert" className="mt-1 text-sm text-wax">{kindError}</p>}
      </fieldset>

      <div>
        <label htmlFor="feedback-message" className="mb-1.5 block text-sm font-semibold text-ink-soft">
          {kind === "bug" ? "What happened, and what did you expect?" : "Tell us"}
        </label>
        <textarea
          id="feedback-message"
          name="message"
          rows={5}
          required
          minLength={3}
          maxLength={FEEDBACK_MESSAGE_MAX}
          defaultValue={state.values?.message}
          onChange={(e) => setLength(e.target.value.length)}
          aria-invalid={Boolean(messageError)}
          aria-describedby="feedback-message-help"
          className="field"
          placeholder={kind === "bug" ? "When I tap …, the page …" : "I wish hidl could …"}
        />
        <p id="feedback-message-help" className="mt-1 flex justify-between gap-2 text-xs text-muted">
          <span>Don&apos;t include anything from a private letter: admins can read what you send here.</span>
          <span className="shrink-0 tabular-nums">{length}/{FEEDBACK_MESSAGE_MAX}</span>
        </p>
        {messageError && <p role="alert" className="mt-1 text-sm text-wax">{messageError}</p>}
      </div>

      {state.status === "error" && state.message && !messageError && !kindError && (
        <p role="alert" className="text-sm text-wax">{state.message}</p>
      )}

      <button type="submit" className="btn btn-primary self-start" disabled={pending}>
        {pending ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
