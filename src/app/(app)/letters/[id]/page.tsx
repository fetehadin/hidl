import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Envelope } from "@/components/envelope";
import { letterState, sealInitial } from "@/components/letters/letter-card";
import { DeleteLetterButton, ChangeDateForm } from "@/components/letters/letter-manage";
import { LetterPaper } from "@/components/letters/letter-paper";
import { DecryptedLetter } from "@/components/letters/decrypted-letter";
import { type KeyUser, LetterKeyGate } from "@/components/letters/letter-key";
import { EncryptedLetterReveal, LetterReveal } from "@/components/letters/letter-reveal";
import { LiveRelative } from "@/components/live-relative";
import { type LetterPasskey, getKeyBundle, getLetterPasskeys } from "@/lib/data/letter-keys";
import { type LetterMeta, getLetterMeta, openLetter } from "@/lib/data/letters";
import type { KeyBundle } from "@/lib/e2ee";
import { formatDay, formatFullDate } from "@/lib/dates";
import { requireUser } from "@/lib/supabase/server";
import { utcToLocalInput } from "@/lib/time";
import { letterIdSchema } from "@/lib/validation/letters";

export const metadata: Metadata = { title: "Letter" };

export default async function LetterPage({ params }: PageProps<"/letters/[id]">) {
  const { id } = await params;
  const parsed = letterIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  const { supabase, calendar, user, timeZone } = await requireUser();
  const letter = await getLetterMeta(supabase, parsed.data);
  if (!letter) notFound();
  // Only an encrypted letter that's ready to read needs the key on this page.
  const needsKey = letter.encrypted && letterState(letter) !== "sealed";
  const [bundle, passkeys] = needsKey
    ? await Promise.all([getKeyBundle(supabase), getLetterPasskeys(supabase)])
    : [null, [] as LetterPasskey[]];
  const keyUser = { id: user.id, email: user.email ?? "" };

  const state = letterState(letter);
  const initial = sealInitial(letter.recipient);

  return (
    <div className="pt-2">
      <Link href="/letters" className="text-sm text-muted hover:text-ink">← Letters</Link>

      <div className="mt-6">
        {state === "sealed" && (
          <div className="space-y-5">
            <Envelope state="sealed" initial={initial} className="mx-auto max-w-md">
              <div className="text-center">
                <p className="font-hand text-xl text-accent">for {letter.recipient}</p>
                <h1 className="mt-1 font-title text-2xl font-medium">{letter.title}</h1>
                {letter.occasion && <p className="text-ink-soft">{letter.occasion}</p>}
                <p className="mt-5 font-display text-xl">
                  <LiveRelative target={letter.unlock_at} />
                </p>
                <p className="text-sm text-muted">{formatFullDate(letter.unlock_at, calendar, timeZone, { time: true })}</p>
                <p className="mt-4 text-sm text-muted">
                  Sealed {formatDay(letter.created_at, calendar, timeZone)}. No peeking.
                </p>
              </div>
            </Envelope>
            <div className="mx-auto max-w-md space-y-4">
              <ChangeDateForm id={letter.id} currentLocal={utcToLocalInput(letter.unlock_at, timeZone)} />
              <div className="text-center"><DeleteLetterButton id={letter.id} /></div>
            </div>
          </div>
        )}

        {state === "ready" &&
          (letter.encrypted ? (
            <LetterKeyGate user={keyUser} bundle={bundle} passkeys={passkeys} need="read">
              <EncryptedLetterReveal {...revealProps(letter, initial)} />
            </LetterKeyGate>
          ) : (
            <LetterReveal {...revealProps(letter, initial)} />
          ))}

        {state === "opened" && (
          <OpenedLetter id={letter.id} encrypted={letter.encrypted} keyUser={keyUser} bundle={bundle} passkeys={passkeys} />
        )}
      </div>
    </div>
  );
}

function revealProps(letter: LetterMeta, initial: string) {
  return {
    id: letter.id,
    title: letter.title,
    recipient: letter.recipient,
    occasion: letter.occasion,
    initial,
    createdAt: letter.created_at,
    unlockAt: letter.unlock_at,
  };
}

async function OpenedLetter({ id, encrypted, keyUser, bundle, passkeys }: {
  id: string;
  encrypted: boolean;
  keyUser: KeyUser;
  bundle: KeyBundle | null;
  passkeys: LetterPasskey[];
}) {
  const { supabase, user, calendar, timeZone } = await requireUser();
  const letter = await openLetter(supabase, id, user.id);
  const paper = {
    title: letter.title,
    recipient: letter.recipient,
    body: letter.body,
    createdAt: letter.created_at,
    unlockAt: letter.unlock_at,
    calendar,
    timeZone,
  };
  return (
    <div className="space-y-6">
      {encrypted ? (
        <LetterKeyGate user={keyUser} bundle={bundle} passkeys={passkeys} need="read">
          <DecryptedLetter id={id} {...paper} />
        </LetterKeyGate>
      ) : (
        <LetterPaper {...paper} />
      )}
      <p className="text-center text-sm text-muted">First opened {formatDay(letter.opened_at!, calendar, timeZone)}</p>
      <div className="text-center"><DeleteLetterButton id={id} /></div>
    </div>
  );
}
