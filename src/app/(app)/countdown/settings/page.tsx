import type { Metadata } from "next";
import Link from "next/link";
import { WidgetToken } from "@/components/countdown/widget-token";
import { PageHeader } from "@/components/page-header";
import { getWidgetTokenCreatedAt } from "@/lib/data/widget-token";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Widget settings" };

export default async function CountdownSettingsPage() {
  const { supabase } = await requireUser();
  const createdAt = await getWidgetTokenCreatedAt(supabase);

  return (
    <>
      <Link href="/countdown" className="text-sm text-muted hover:text-ink">← Countdown</Link>
      <PageHeader eyebrow="settings" title="Widget" />
      <WidgetToken createdAt={createdAt} />
      <p className="mt-4 text-center text-sm text-muted">
        Star a countdown on the <Link href="/countdown" className="underline-offset-4 hover:underline">countdown page</Link> to
        choose which one this feed shows.
      </p>
    </>
  );
}
