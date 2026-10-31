import type { Metadata } from "next";
import Link from "next/link";
import { CountdownForm } from "@/components/countdown/countdown-form";
import { KindPicker } from "@/components/countdown/kind-picker";
import { PageHeader } from "@/components/page-header";
import { isCountdownKind, KIND_INFO } from "@/lib/countdown-kinds";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "New countdown" };

export default async function NewCountdownPage({ searchParams }: PageProps<"/countdown/new">) {
  await requireUser();
  const { kind } = await searchParams;

  return (
    <>
      <Link href="/countdown" className="text-sm text-muted hover:text-ink">← Countdown</Link>
      {isCountdownKind(kind) ? (
        <>
          <PageHeader eyebrow="new" title={`Add ${kind === "deadline" ? "a countdown" : `a ${KIND_INFO[kind].label.toLowerCase()}`}`} />
          <div className="card max-w-2xl p-5 sm:p-6">
            <CountdownForm
              key={kind}
              locked={false}
              defaults={{ kind, title: "", target_local: "", target_score: "", max_score: "", details: {} }}
            />
          </div>
        </>
      ) : (
        <>
          <PageHeader eyebrow="new" title="What are you counting down to?" />
          <KindPicker />
        </>
      )}
    </>
  );
}
