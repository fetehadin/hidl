"use client";

import { useState } from "react";
import { WEEKDAYS, leadingBlanks, monthDays } from "@/lib/calendar";
import type { PhotoView } from "@/lib/data/photos";
import { Lightbox } from "./lightbox";
import { UploadSheet } from "./upload-sheet";

type UploadMode = { kind: "add"; date: string } | { kind: "replace"; date: string; photoId: string };

export function MonthGrid({ month, today, photos }: { month: string; today: string; photos: PhotoView[] }) {
  const byDate = new Map<string, PhotoView[]>();
  for (const p of photos) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [upload, setUpload] = useState<UploadMode | null>(null);

  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-center sm:gap-2" role="grid" aria-label="Days of the month">
        <div role="row" className="contents">
          {WEEKDAYS.map((d) => (
            <div key={d} role="columnheader" className="pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
              <span className="sm:hidden">{d.charAt(0)}</span>
              <span className="hidden sm:inline">{d}</span>
            </div>
          ))}
        </div>
        <div role="row" className="contents">
          {Array.from({ length: leadingBlanks(month) }, (_, i) => (
            <div key={`blank-${i}`} aria-hidden />
          ))}
          {monthDays(month).map((date) => {
            const dayPhotos = byDate.get(date);
            const day = Number(date.slice(8));
            const isToday = date === today;
            const isFuture = date > today;
            const ring = isToday ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : "";

            if (dayPhotos && dayPhotos.length > 0) {
              const cover = dayPhotos[0];
              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  onClick={() => setLightbox(photos.indexOf(cover))}
                  className={`group relative aspect-square overflow-hidden rounded-lg bg-paper-deep sm:rounded-xl ${ring}`}
                  aria-label={`${date}${cover.caption ? `: ${cover.caption}` : ""}. ${dayPhotos.length > 1 ? `${dayPhotos.length} photos. ` : ""}Open photo`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover.thumbUrl} alt="" loading="lazy" decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <span className="absolute top-0.5 left-1 text-[11px] font-bold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.7)] sm:text-xs">
                    {day}
                  </span>
                  {dayPhotos.length > 1 && (
                    <span className="absolute right-1 bottom-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      +{dayPhotos.length - 1}
                    </span>
                  )}
                </button>
              );
            }

            if (isFuture) {
              return (
                <div key={date} role="gridcell" aria-disabled
                  className="grid aspect-square place-items-center rounded-lg text-sm text-muted/50 sm:rounded-xl">
                  {day}
                </div>
              );
            }

            return (
              <button
                key={date}
                type="button"
                role="gridcell"
                onClick={() => setUpload({ kind: "add", date })}
                aria-label={`${date}. Add a photo`}
                className={`grid aspect-square place-items-center rounded-lg border border-dashed text-sm transition-colors sm:rounded-xl ${
                  isToday
                    ? `border-accent bg-accent-soft font-bold text-accent ${ring}`
                    : "border-line bg-card/60 text-ink-soft hover:border-accent hover:text-accent"
                }`}
              >
                {isToday ? <span className="leading-tight">{day}<span className="block text-lg leading-none">+</span></span> : day}
              </button>
            );
          })}
        </div>
      </div>

      {lightbox !== null && (
        <Lightbox
          photos={photos}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          onReplace={(photoId) => {
            setLightbox(null);
            setUpload({ kind: "replace", date: photos[lightbox].date, photoId });
          }}
          onAddAnother={(date) => {
            setLightbox(null);
            setUpload({ kind: "add", date });
          }}
        />
      )}
      {upload && (
        <UploadSheet
          key={upload.kind === "replace" ? upload.photoId : upload.date}
          mode={upload}
          onClose={() => setUpload(null)}
        />
      )}
    </>
  );
}
