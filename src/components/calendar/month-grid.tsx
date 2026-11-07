"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { WEEKDAYS, leadingBlanks, monthDays } from "@/lib/calendar";
import type { PhotoView } from "@/lib/data/photos";
import { Lightbox, UploadSheet, usePreloadPhotoTools } from "./lazy";
import { VideoBadge } from "./video-badge";

type UploadMode = { kind: "add"; date: string } | { kind: "replace"; date: string; photoId: string };

export function MonthGrid({
  month,
  today,
  photos,
  addToday = false,
}: {
  month: string;
  today: string;
  photos: PhotoView[];
  /** Open the upload sheet for today right away (Hidi's camera shortcut: /calendar?add=today). */
  addToday?: boolean;
}) {
  usePreloadPhotoTools();
  const router = useRouter();
  const byDate = new Map<string, PhotoView[]>();
  for (const p of photos) byDate.set(p.date, [...(byDate.get(p.date) ?? []), p]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [upload, setUpload] = useState<UploadMode | null>(null);
  const days = monthDays(month);
  const [focusedIndex, setFocusedIndex] = useState(() => Math.max(0, days.indexOf(today)));
  const cellRefs = useRef<(HTMLElement | null)[]>([]);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  // Open the sheet once each time ?add=today arrives (also when already on /calendar).
  const [handledAdd, setHandledAdd] = useState(false);
  if (addToday !== handledAdd) {
    setHandledAdd(addToday);
    if (addToday) setUpload({ kind: "add", date: today });
  }
  useEffect(() => {
    // Drop ?add=today so a refresh or Back doesn't reopen the sheet.
    if (addToday) router.replace("/calendar", { scroll: false });
  }, [addToday, router]);

  function moveFocus(from: number, delta: number) {
    const to = Math.min(days.length - 1, Math.max(0, from + delta));
    setFocusedIndex(to);
    cellRefs.current[to]?.focus();
  }

  function onGridKeyDown(e: React.KeyboardEvent, i: number) {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        moveFocus(i, 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        moveFocus(i, -1);
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(i, 7);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(i, -7);
        break;
    }
  }

  function openLightbox(photoIndex: number, trigger: HTMLElement) {
    returnFocusTo.current = trigger;
    setLightbox(photoIndex);
  }

  function openUpload(mode: UploadMode, trigger: HTMLElement) {
    returnFocusTo.current = trigger;
    setUpload(mode);
  }

  function closeLightbox() {
    setLightbox(null);
    returnFocusTo.current?.focus();
  }

  function closeUpload() {
    setUpload(null);
    returnFocusTo.current?.focus();
  }

  return (
    <>
      {/*
        Sized to the viewport: as tall as the screen allows (minus the app header, month row
        and tab bar, which is --chrome), so the photos get as much room as possible. Cells are
        never more than 1.8x taller than wide; on wide screens the page wrapper (calendar/page.tsx)
        narrows the grid so cells stay portrait, like photos. --rows is the month's number of
        weeks (4 to 6), set by the page. --chrome also leaves room below the grid for Hidi's
        corner menu (above the tab bar on phones), so it never covers a day.
      */}
      <div
        className="calendar-grid grid h-[max(14rem,min(calc(100dvh-var(--chrome)),calc(100cqw*var(--rows)/7*1.8)))] grid-cols-7 grid-rows-[auto_repeat(var(--rows),minmax(0,1fr))] gap-[3px] px-[3px] [--chrome:21.5rem] sm:gap-1.5 sm:px-0 sm:[--chrome:16.5rem]"
        role="grid"
        aria-label="Days of the month"
      >
        <div role="row" className="contents">
          {WEEKDAYS.map((d) => (
            <div key={d} role="columnheader" className="pb-1 text-center text-[11px] font-semibold tracking-wider text-muted uppercase">
              <span className="sm:hidden">{d.charAt(0)}</span>
              <span className="hidden sm:inline">{d}</span>
            </div>
          ))}
        </div>
        <div role="row" className="contents">
          {Array.from({ length: leadingBlanks(month) }, (_, i) => (
            <div key={`blank-${i}`} aria-hidden />
          ))}
          {days.map((date, i) => {
            const dayPhotos = byDate.get(date);
            const day = Number(date.slice(8));
            const isToday = date === today;
            const isFuture = date > today;
            const tabIndex = i === focusedIndex ? 0 : -1;
            const ring = isToday ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : "";
            const cell = "relative min-h-0 overflow-hidden rounded-[7px] sm:rounded-control";
            const number = "absolute top-1 left-1.5 text-[12px] leading-none font-extrabold tabular-nums sm:top-1.5 sm:left-2 sm:text-sm";

            if (dayPhotos && dayPhotos.length > 0) {
              // The pinned "wallpaper" if the day has one, else its first photo.
              const cover = dayPhotos.find((p) => p.isCover) ?? dayPhotos[0];
              return (
                <button
                  key={date}
                  ref={(el) => {
                    cellRefs.current[i] = el;
                  }}
                  type="button"
                  role="gridcell"
                  tabIndex={tabIndex}
                  onFocus={() => setFocusedIndex(i)}
                  onKeyDown={(e) => onGridKeyDown(e, i)}
                  onClick={(e) => openLightbox(photos.indexOf(cover), e.currentTarget)}
                  className={`group ${cell} bg-paper-deep ${ring}`}
                  aria-label={`${date}${cover.caption ? `: ${cover.caption}` : ""}. ${dayPhotos.length > 1 ? `${dayPhotos.length} photos and videos. ` : ""}Open ${cover.isVideo ? "video" : "photo"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover.thumbUrl} alt="" loading="lazy" decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  {/* A soft shade under the date so it reads on bright photos. */}
                  <span aria-hidden className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-scrim/45 to-transparent" />
                  {cover.isVideo && <VideoBadge className="absolute bottom-1 left-1 scale-75 sm:scale-100" />}
                  <span className={`${number} text-snow [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]`}>{day}</span>
                  {dayPhotos.length > 1 && (
                    <span className="absolute right-1 bottom-1 rounded-full bg-scrim/70 px-1.5 py-0.5 text-[10px] leading-none font-bold text-snow tabular-nums sm:text-xs">
                      +{dayPhotos.length - 1}
                    </span>
                  )}
                </button>
              );
            }

            if (isFuture) {
              return (
                <div
                  key={date}
                  ref={(el) => {
                    cellRefs.current[i] = el;
                  }}
                  role="gridcell"
                  aria-disabled
                  tabIndex={tabIndex}
                  onFocus={() => setFocusedIndex(i)}
                  onKeyDown={(e) => onGridKeyDown(e, i)}
                  className={`${cell} text-muted/50`}
                >
                  <span className={number}>{day}</span>
                </div>
              );
            }

            return (
              <button
                key={date}
                ref={(el) => {
                  cellRefs.current[i] = el;
                }}
                type="button"
                role="gridcell"
                tabIndex={tabIndex}
                onFocus={() => setFocusedIndex(i)}
                onKeyDown={(e) => onGridKeyDown(e, i)}
                onClick={(e) => openUpload({ kind: "add", date }, e.currentTarget)}
                aria-label={`${date}. Add a photo`}
                className={`${cell} transition-colors ${
                  isToday
                    ? "border-2 border-dashed border-accent bg-accent-soft text-accent"
                    : "bg-paper-deep text-muted hover:bg-accent-soft hover:text-accent"
                }`}
              >
                <span className={number}>{day}</span>
                {isToday && <span className="absolute inset-0 grid place-items-center text-2xl leading-none font-semibold">+</span>}
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
          onClose={closeLightbox}
          onReplace={(photoId) => {
            const date = photos[lightbox].date;
            setLightbox(null);
            setUpload({ kind: "replace", date, photoId });
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
          onClose={closeUpload}
        />
      )}
    </>
  );
}
