"use client";

import { useRef, useState } from "react";
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
  const days = monthDays(month);
  const [focusedIndex, setFocusedIndex] = useState(() => Math.max(0, days.indexOf(today)));
  const cellRefs = useRef<(HTMLElement | null)[]>([]);
  const returnFocusTo = useRef<HTMLElement | null>(null);

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
        Sized to the viewport: as tall as the screen allows (minus the header, month nav
        and tab bar, which is --chrome) but never taller than square cells would make it.
        So on a laptop the cells get wider instead of the page scrolling, and on a phone
        they stay square. --rows is the month's number of weeks (4 to 6).
      */}
      <div
        className="calendar-grid grid h-[max(16rem,min(calc(100dvh-var(--chrome)),calc((100cqw-1rem)*var(--rows)/7+2rem)))] grid-cols-7 grid-rows-[auto_repeat(var(--rows),minmax(0,1fr))] gap-1 text-center [--chrome:18.5rem] sm:gap-2 sm:[--chrome:16rem]"
        style={{ "--rows": Math.ceil((leadingBlanks(month) + days.length) / 7) } as React.CSSProperties}
        role="grid"
        aria-label="Days of the month"
      >
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
          {days.map((date, i) => {
            const dayPhotos = byDate.get(date);
            const day = Number(date.slice(8));
            const isToday = date === today;
            const isFuture = date > today;
            const tabIndex = i === focusedIndex ? 0 : -1;
            const ring = isToday ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : "";

            if (dayPhotos && dayPhotos.length > 0) {
              const cover = dayPhotos[0];
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
                  className={`group relative min-h-0 overflow-hidden rounded-control bg-paper-deep ${ring}`}
                  aria-label={`${date}${cover.caption ? `: ${cover.caption}` : ""}. ${dayPhotos.length > 1 ? `${dayPhotos.length} photos. ` : ""}Open photo`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cover.thumbUrl} alt="" loading="lazy" decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                  <span className="absolute top-0.5 left-1 text-[11px] font-bold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.7)] sm:text-xs">
                    {day}
                  </span>
                  {dayPhotos.length > 1 && (
                    <span className="absolute right-1 bottom-1 rounded-full bg-ocean/85 px-1.5 py-0.5 text-[10px] font-bold text-white">
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
                  className="grid min-h-0 place-items-center rounded-control text-sm text-muted"
                >
                  {day}
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
                className={`grid min-h-0 place-items-center rounded-control text-sm transition-colors ${
                  isToday
                    ? `border-2 border-accent bg-accent-soft font-bold text-accent ${ring}`
                    : "border border-line/70 bg-card/40 text-ink-soft hover:border-accent hover:bg-accent-soft hover:text-accent"
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
