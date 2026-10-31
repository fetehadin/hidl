import type { Metadata } from "next";
import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { MemoryBoard } from "@/components/memories/memory-board";
import { PageHeader } from "@/components/page-header";
import { listPhotos, signPhotos } from "@/lib/data/photos";
import { requireUser } from "@/lib/supabase/server";
import { todayISO } from "@/lib/time";

export const metadata: Metadata = { title: "Memories" };

export default async function MemoriesPage() {
  const { supabase } = await requireUser();
  const today = todayISO();
  // Every photo ever (it's one person's senior year), oldest → newest; the board
  // groups them by day itself. Thumbnails only load as islands come into view.
  const photos = await signPhotos(supabase, await listPhotos(supabase, "1900-01-01", today));

  if (photos.length === 0) {
    return (
      <>
        <PageHeader eyebrow="memory lane" title="Memories" />
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <Mascot mood="curious" size={120} />
          <p className="mt-4 font-display text-2xl font-semibold">Nothing here yet.</p>
          <p className="mt-1 max-w-xs text-ink-soft">
            Every photo you add to the calendar lands here, gathered into one little island per day.
          </p>
          <Link href="/calendar" className="btn btn-primary mt-6">
            Add today&apos;s photo
          </Link>
        </div>
      </>
    );
  }

  return <MemoryBoard photos={photos} today={today} />;
}
