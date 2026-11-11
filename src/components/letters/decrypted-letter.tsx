"use client";

import { useEffect, useState } from "react";
import { resealOpenedLetter } from "@/actions/letters";
import type { CalendarPref } from "@/lib/dates";
import { useLetterReader } from "./letter-key";
import { LetterPaper } from "./letter-paper";

/**
 * An opened, end-to-end encrypted letter: the page gets ciphertext, this decrypts it here. Then
 * it's handed to the server to seal its way (resealOpenedLetter), so next time it opens like
 * every new letter, without the fingerprint or emailed key.
 */
export function DecryptedLetter({ id, ...props }: {
  id: string;
  title: string;
  recipient: string;
  body: string;
  createdAt: string;
  unlockAt: string;
  calendar: CalendarPref;
  timeZone: string;
}) {
  const { decrypt } = useLetterReader();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    decrypt(props.body).then(
      (t) => {
        if (!live) return;
        setText(t);
        moveToServerSealed(id, t);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [decrypt, id, props.body]);

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

/** Best effort: if it fails, the letter simply stays end-to-end and is tried again next time. */
export function moveToServerSealed(id: string, text: string) {
  resealOpenedLetter(id, text).then(
    (r) => !r.ok && console.warn("resealOpenedLetter", r.message),
    (e) => console.warn("resealOpenedLetter", e),
  );
}
