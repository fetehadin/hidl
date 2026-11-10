import type { Metadata } from "next";
import Link from "next/link";
import { LetterForm } from "@/components/letters/letter-form";
import { LetterKeyGate } from "@/components/letters/letter-key";
import { PageHeader } from "@/components/page-header";
import { getKeyBundle, getLetterPasskeys } from "@/lib/data/letter-keys";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New letter" };

export default async function NewLetterPage() {
  const { supabase, user } = await requireUser();
  const [bundle, passkeys] = await Promise.all([getKeyBundle(supabase), getLetterPasskeys(supabase)]);
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/letters" className="text-sm text-muted hover:text-ink">← Letters</Link>
      <PageHeader eyebrow="a letter for later" title="Write a letter" />
      <LetterKeyGate user={{ id: user.id, email: user.email ?? "" }} bundle={bundle} passkeys={passkeys} need="write">
        <LetterForm />
      </LetterKeyGate>
    </div>
  );
}
