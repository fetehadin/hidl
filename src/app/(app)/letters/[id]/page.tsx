import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Envelope } from "@/components/envelope";
import { letterState, sealInitial } from "@/components/letters/letter-card";
import { DeleteLetterButton, PostponeForm } from "@/components/letters/letter-manage";
import { LetterPaper } from "@/components/letters/letter-paper";
import { LetterReveal } from "@/components/letters/letter-reveal";
import { LiveRelative } from "@/components/live-relative";
import { getLetterMeta, openLetter } from "@/lib/data/letters";
import { requireUser } from "@/lib/supabase/server";
import { formatInAppTz, utcToLocalInput } from "@/lib/time";
import { letterIdSchema } from "@/lib/validation/letters";

export const metadata: Metadata = { title: "Letter" };

export default async function LetterPage({ params }: PageProps<"/letters/[id]">) {
  const { id } = await params;
  const parsed = letterIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  const { supabase } = await requireUser();
  const letter = await getLetterMeta(supabase, parsed.data);
  if (!letter) notFound();

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
                <h1 className="mt-1 font-display text-2xl font-semibold">{letter.title}</h1>
                {letter.occasion && <p className="text-ink-soft">{letter.occasion}</p>}
                <p className="mt-5 font-display text-xl">
                  <LiveRelative target={letter.unlock_at} />
                </p>
                <p className="text-ink-soft">
                  {formatInAppTz(letter.unlock_at, "EEEE, MMMM d, yyyy 'at' h:mm a")}
                </p>
                <p className="mt-4 text-sm text-muted">
                  Sealed {formatInAppTz(letter.created_at, "MMMM d, yyyy")}. No peeking.
                </p>
              </div>
            </Envelope>
            <div className="mx-auto max-w-md space-y-4">
              <PostponeForm id={letter.id} currentLocal={utcToLocalInput(letter.unlock_at)} />
              <div className="text-center"><DeleteLetterButton id={letter.id} /></div>
            </div>
          </div>
        )}

        {state === "ready" && (
          <LetterReveal
            id={letter.id}
            title={letter.title}
            recipient={letter.recipient}
            occasion={letter.occasion}
            initial={initial}
            createdAt={letter.created_at}
            unlockAt={letter.unlock_at}
          />
        )}

        {state === "opened" && <OpenedLetter id={letter.id} />}
      </div>
    </div>
  );
}

async function OpenedLetter({ id }: { id: string }) {
  const { supabase } = await requireUser();
  const letter = await openLetter(supabase, id);
  return (
    <div className="space-y-6">
      <LetterPaper
        title={letter.title}
        recipient={letter.recipient}
        body={letter.body}
        createdAt={letter.created_at}
        unlockAt={letter.unlock_at}
      />
      <p className="text-center text-sm text-muted">
        First opened {formatInAppTz(letter.opened_at!, "MMMM d, yyyy 'at' h:mm a")}
      </p>
      <div className="text-center"><DeleteLetterButton id={id} /></div>
    </div>
  );
}
