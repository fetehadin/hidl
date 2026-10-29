"use client";

import Link from "next/link";
import { useState } from "react";
import { UploadSheet } from "@/components/calendar/upload-sheet";
import type { PhotoView } from "@/lib/data/photos";

export function DashboardTodayPhoto({ photo, today }: { photo: PhotoView | null; today: string }) {
  const [uploading, setUploading] = useState(false);

  if (photo) {
    return (
      <Link href="/calendar" className="block overflow-hidden rounded-control">
        <div className="aspect-[4/3] overflow-hidden rounded-control ring-1 ring-inset ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.fullUrl} alt={photo.caption ?? "Today's photo"} className="h-full w-full object-cover" />
        </div>
        {photo.caption && <p className="mt-2 text-ink-soft">{photo.caption}</p>}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setUploading(true)}
        className="grid aspect-[4/3] w-full place-items-center rounded-control border border-dashed border-line bg-paper text-center text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <span>
          <span className="block font-hand text-2xl">an empty page</span>
          <span className="text-sm">Tap to add today&apos;s photo</span>
        </span>
      </button>
      {uploading && <UploadSheet mode={{ kind: "add", date: today }} onClose={() => setUploading(false)} />}
    </>
  );
}
