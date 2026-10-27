import type { Metadata } from "next";
import Link from "next/link";
import { EnvelopeIcon, PlusIcon } from "@/components/icons";
import { ClearDraft } from "@/components/letters/clear-draft";
import { LetterCard, letterState } from "@/components/letters/letter-card";
import { PageHeader } from "@/components/page-header";
import { listLetters } from "@/lib/data/letters";
import { requireUser } from "@/lib/supabase/server";
import { requestNow } from "@/lib/time";

export const metadata: Metadata = { title: "Letters" };

export default async function LettersPage({ searchParams }: PageProps<"/letters">) {
  const { supabase } = await requireUser();
  const [letters, { sealed: justSealed }] = await Promise.all([listLetters(supabase), searchParams]);
  const now = requestNow();

  const ready = letters.filter((l) => letterState(l, now) === "ready");
  const sealed = letters.filter((l) => letterState(l, now) === "sealed");
  const opened = letters
    .filter((l) => letterState(l, now) === "opened")
    .sort((a, b) => b.opened_at!.localeCompare(a.opened_at!));

  return (
    <>
      <PageHeader eyebrow="sealed for later" title="Letters">
        <Link href="/letters/new" className="btn btn-primary">
          <PlusIcon width={18} height={18} />
          Write
        </Link>
      </PageHeader>

      {justSealed && (
        <p role="status" className="animate-fade-up mb-5 rounded-xl bg-sage-soft px-4 py-3 text-ink">
          Sealed. It&apos;ll be waiting for you.
          <ClearDraft />
        </p>
      )}

      {letters.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <EnvelopeIcon width={40} height={40} className="text-accent" />
          <p className="mt-3 font-display text-2xl">No letters yet.</p>
          <p className="mt-1 max-w-xs text-ink-soft">
            Write to yourself on graduation day, your birthday, or a year from now. Once sealed, it stays sealed.
          </p>
          <Link href="/letters/new" className="btn btn-primary mt-5">
            Write your first letter
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <LetterSection title="Ready to open" letters={ready} now={now} />
          <LetterSection title="Still sealed" letters={sealed} now={now} />
          <LetterSection title="Opened" letters={opened} now={now} />
        </div>
      )}
    </>
  );
}

function LetterSection({
  title,
  letters,
  now,
}: {
  title: string;
  letters: Awaited<ReturnType<typeof listLetters>>;
  now: number;
}) {
  if (letters.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
        {title} <span className="font-normal">· {letters.length}</span>
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {letters.map((l) => (
          <li key={l.id}>
            <LetterCard letter={l} now={now} />
          </li>
        ))}
      </ul>
    </section>
  );
}
