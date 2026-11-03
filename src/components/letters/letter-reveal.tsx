"use client";

import { useState, useTransition } from "react";
import { openLetterAction } from "@/actions/letters";
import { Envelope } from "@/components/envelope";
import { useCalendarPref } from "@/components/calendar-pref";
import { decryptBody } from "@/lib/e2ee";
import { useLetterKey } from "./letter-key";
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

/** An end-to-end encrypted letter: same reveal, decrypted on this device once it's released. */
export function EncryptedLetterReveal(props: Props) {
  const key = useLetterKey();
  return <LetterReveal {...props} decrypt={(body) => decryptBody(key, body)} />;
}

export function LetterReveal(props: Props & { decrypt?: (body: string) => Promise<string> }) {
  const calendar = useCalendarPref();
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
      let text = result.body;
      if (props.decrypt) {
        try {
          text = await props.decrypt(result.body);
        } catch {
          setError("This letter couldn't be decrypted with your key.");
          return;
        }
      }
      setBody(text);
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
          calendar={calendar}
          body={body}
          createdAt={props.createdAt}
          unlockAt={props.unlockAt}
        />
      )}
    </div>
  );
}
