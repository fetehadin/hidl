"use client";

import { useState } from "react";
import { WEEKDAYS, leadingBlanks, monthDays } from "@/lib/calendar";
import type { PhotoView } from "@/lib/data/photos";
import { Lightbox } from "./lightbox";
import { UploadSheet } from "./upload-sheet";

export function MonthGrid({ month, today, photos }: { month: string; today: string; photos: PhotoView[] }) {
  const byDate = new Map(photos.map((p) => [p.date, p]));
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [upload, setUpload] = useState<string | null>(null);

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
            const photo = byDate.get(date);
            const day = Number(date.slice(8));
            const isToday = date === today;
            const isFuture = date > today;
            const ring = isToday ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : "";

            if (photo) {
              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  onClick={() => setLightbox(photos.indexOf(photo))}
                  className={`group relative aspect-square overflow-hidden rounded-lg bg-paper-deep sm:rounded-xl ${ring}`}
                  aria-label={`${date}${photo.caption ? `: ${photo.caption}` : ""}. Open photo`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.thumbUrl} alt="" loading="lazy" decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <span className="absolute top-0.5 left-1 text-[11px] font-bold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.7)] sm:text-xs">
                    {day}
                  </span>
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
                onClick={() => setUpload(date)}
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
          onReplace={(date) => {
            setLightbox(null);
            setUpload(date);
          }}
        />
      )}
      {upload && (
        <UploadSheet
          key={upload}
          date={upload}
          hasPhoto={byDate.has(upload)}
          initialCaption={byDate.get(upload)?.caption}
          onClose={() => setUpload(null)}
        />
      )}
    </>
  );
}
