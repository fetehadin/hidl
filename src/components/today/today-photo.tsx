"use client";

import Link from "next/link";
import { useState } from "react";
import { UploadSheet, usePreloadPhotoTools } from "@/components/calendar/lazy";
import { VideoBadge } from "@/components/calendar/video-badge";
import { CameraIcon } from "@/components/icons";
import type { PhotoView } from "@/lib/data/photos";

/**
 * Today's photo as a tile: the picture itself (caption on it), or, before there is one, an empty
 * page with a camera that opens the upload sheet. Always shown, so a new person sees at a glance
 * that this is where a day's photo goes.
 */
export function TodayPhoto({
  photo,
  today,
  href,
  className = "",
}: {
  photo: PhotoView | null;
  today: string;
  href: string;
  className?: string;
}) {
  usePreloadPhotoTools({ lightbox: false });
  const [uploading, setUploading] = useState(false);

  if (photo) {
    return (
      <Link
        href={href}
        className={`animate-fade-up relative block min-h-44 overflow-hidden rounded-card bg-paper-deep ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link; next/image would re-fetch it */}
        <img
          src={photo.isVideo ? photo.thumbUrl : photo.fullUrl}
          alt={photo.caption ?? (photo.isVideo ? "Today's video" : "Today's photo")}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className="absolute top-2.5 left-2.5 rounded-full bg-scrim/40 px-2 py-1 text-[10px] font-extrabold tracking-widest text-snow uppercase backdrop-blur">
          Today
        </span>
        {photo.isVideo && <VideoBadge className="absolute top-2.5 right-2.5" />}
        {photo.caption && (
          <span className="absolute inset-x-0 bottom-0 line-clamp-3 bg-gradient-to-t from-scrim/70 to-transparent px-3.5 pt-10 pb-3 text-[15px] font-semibold text-snow">
            {photo.caption}
          </span>
        )}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setUploading(true)}
        className={`group animate-fade-up tint-aqua relative grid min-h-44 w-full place-items-center overflow-hidden rounded-card border-2 border-dashed border-aqua p-4 text-center transition-colors hover:border-teal ${className}`}
      >
        <span aria-hidden className="absolute top-3 left-3.5 text-[10px] font-extrabold tracking-widest text-accent uppercase">
          Today
        </span>
        <span className="flex flex-col items-center">
          <span className="relative grid size-14 place-items-center rounded-full bg-teal text-accent-ink shadow-[0_8px_20px_-8px_var(--teal)] transition-transform group-hover:scale-105 lg:size-16">
            <span aria-hidden className="animate-ping-soft absolute inset-0 rounded-full ring-2 ring-teal" />
            <CameraIcon width={26} height={26} />
          </span>
          <span className="mt-3 block font-hand text-xl leading-none text-ink-soft lg:text-2xl">an empty page</span>
          <span className="mt-1.5 block text-sm font-semibold text-muted">Add today&apos;s photo</span>
        </span>
      </button>
      {uploading && <UploadSheet mode={{ kind: "add", date: today }} onClose={() => setUploading(false)} />}
    </>
  );
}
