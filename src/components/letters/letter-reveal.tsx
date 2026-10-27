"use client";

import { useState, useTransition } from "react";
import { openLetterAction } from "@/actions/letters";
import { Envelope } from "@/components/envelope";
import { LetterPaper } from "./letter-paper";

type Props = {
  id: string;
  title: string;
  recipient: string;
  occasion: string | null;
  initial: string;
  createdAt: string;
  unlockAt: string;
};

export function LetterReveal(props: Props) {
  const [phase, setPhase] = useState<"idle" | "opening" | "open">("idle");
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setError(null);
    startTransition(async () => {
      const result = await openLetterAction(props.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBody(result.body);
      setPhase("opening");
      setTimeout(() => setPhase("open"), 700);
    });
  }

  return (
    <div className="reveal" data-phase={phase}>
      {phase !== "open" && (
        <Envelope state={phase === "idle" ? "ready" : "opened"} initial={props.initial} className="mx-auto max-w-md">
          <div className="text-center">
            <p className="font-hand text-xl text-accent">for {props.recipient}</p>
            <h1 className="mt-1 font-display text-2xl font-semibold">{props.title}</h1>
            {props.occasion && <p className="text-ink-soft">{props.occasion}</p>}
            <p className="mt-4 text-ink-soft">It&apos;s time. This letter has been waiting for you.</p>
            <button type="button" onClick={open} disabled={pending || phase !== "idle"} className="btn btn-primary mt-5">
              {pending ? "Opening…" : "Break the seal"}
            </button>
            {error && (
              <p role="alert" className="mt-3 text-sm text-wax">
                {error}
              </p>
            )}
          </div>
        </Envelope>
      )}

      {phase === "open" && body !== null && (
        <LetterPaper
          className="reveal-letter [animation-delay:0ms]"
          title={props.title}
          recipient={props.recipient}
          body={body}
          createdAt={props.createdAt}
          unlockAt={props.unlockAt}
        />
      )}
    </div>
  );
}
