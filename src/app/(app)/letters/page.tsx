import type { Metadata } from "next";
import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { PlusIcon } from "@/components/icons";
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
        <p role="status" className="animate-fade-up mb-5 rounded-control bg-sage-soft px-4 py-3 text-ink">
          Sealed. It&apos;ll be waiting for you.
          <ClearDraft />
        </p>
      )}

      {letters.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <Mascot mood="happy" size={110} />
          <p className="mt-4 font-display text-2xl font-semibold">No letters yet.</p>
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
          <LetterSection title="Opened" letters={opened} now={now} emptyHint="Nothing opened yet." />
        </div>
      )}
    </>
  );
}

function LetterSection({
  title,
  letters,
  now,
  emptyHint,
}: {
  title: string;
  letters: Awaited<ReturnType<typeof listLetters>>;
  now: number;
  /** Shown instead of hiding the section entirely, for sections worth always seeing. */
  emptyHint?: string;
}) {
  if (letters.length === 0) {
    if (!emptyHint) return null;
    return (
      <section>
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
        <p className="text-ink-soft">{emptyHint}</p>
      </section>
    );
  }

  // A fixed multi-column grid leaves a lone card (or two) looking stranded in an
  // otherwise-empty row. Only widen the grid as far as there's content to fill it.
  const gridClass =
    letters.length === 1
      ? "max-w-sm sm:max-w-md"
      : letters.length === 2
        ? "sm:grid-cols-2 max-w-3xl"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
        {title} <span className="font-normal">· {letters.length}</span>
      </h2>
      <ul className={`grid gap-4 ${gridClass}`}>
        {letters.map((l) => (
          <li key={l.id}>
            <LetterCard letter={l} now={now} />
          </li>
        ))}
      </ul>
    </section>
  );
}
