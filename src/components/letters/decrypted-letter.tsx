"use client";

import { useEffect, useState } from "react";
import { decryptBody } from "@/lib/e2ee";
import type { CalendarPref } from "@/lib/dates";
import { useLetterKey } from "./letter-key";
import { LetterPaper } from "./letter-paper";

/** An opened, end-to-end encrypted letter: the page gets ciphertext, this decrypts it here. */
export function DecryptedLetter(props: {
  title: string;
  recipient: string;
  body: string;
  createdAt: string;
  unlockAt: string;
  calendar: CalendarPref;
  timeZone: string;
}) {
  const key = useLetterKey();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    decryptBody(key, props.body).then(
      (t) => live && setText(t),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [key, props.body]);

  if (failed) {
    return (
      <p role="alert" className="card mx-auto max-w-lg p-5 text-center text-ink-soft">
        This letter couldn&apos;t be decrypted with your key.
      </p>
    );
  }
  if (text === null) return <p className="py-10 text-center text-muted">Decrypting…</p>;
  return <LetterPaper {...props} body={text} />;
}
