import type { Metadata } from "next";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { MemoryBoard } from "@/components/memories/memory-board";
import { PageHeader } from "@/components/page-header";
import { listPhotoGroups } from "@/lib/data/photo-groups";
import { listPhotos, signPhotos } from "@/lib/data/photos";
import { requireUser } from "@/lib/supabase/server";
import { todayISO } from "@/lib/time";

export const metadata: Metadata = { title: "Memories" };

export default async function MemoriesPage({ searchParams }: PageProps<"/memories">) {
  const { by } = await searchParams;
  const { supabase, user, timeZone } = await requireUser();
  const today = todayISO(timeZone);
  // Every photo ever (it's one person's journal), oldest → newest; the board
  // groups them by day itself. Thumbnails only load as islands come into view.
  const [rows, groups] = await Promise.all([listPhotos(supabase, "1900-01-01", today), listPhotoGroups(supabase)]);
  const photos = await signPhotos(supabase, user.id, rows);

  if (photos.length === 0) {
    return (
      <>
        <PageHeader eyebrow="memory lane" title="Memories" />
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <Mascot mood="curious" size={120} />
          <p className="mt-4 font-display text-2xl font-semibold text-heading">Nothing here yet.</p>
          <p className="mt-1 max-w-xs text-ink-soft">
            Every photo you add to the calendar lands here, gathered into one little island per day, or
            per group you make.
          </p>
          <Link href="/calendar" className="btn btn-primary mt-6">
            Add today&apos;s photo
          </Link>
        </div>
      </>
    );
  }

  // Which photos to put straight into the HTML depends on the screen size the camera starts on.
  const phone = userAgent({ headers: await headers() }).device.type === "mobile";
  return <MemoryBoard photos={photos} today={today} phone={phone} groupBy={by === "group" ? "group" : "day"} groups={groups} />;
}
