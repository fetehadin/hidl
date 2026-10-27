import type { Metadata } from "next";
import Link from "next/link";
import { LetterForm } from "@/components/letters/letter-form";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "New letter" };

export default function NewLetterPage() {
  return (
    <>
      <Link href="/letters" className="text-sm text-muted hover:text-ink">← Letters</Link>
      <PageHeader eyebrow="a letter for later" title="Write a letter" />
      <div className="card p-5 sm:p-6">
        <LetterForm />
      </div>
    </>
  );
}
