"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Lightbox } from "@/components/calendar/lightbox";
import { UploadSheet } from "@/components/calendar/upload-sheet";
import { Mascot } from "@/components/mascot";
import type { PhotoView } from "@/lib/data/photos";
import { formatEthiopian } from "@/lib/ethiopian";
import { layoutMemories, memoriesBounds, type MemoryCluster } from "@/lib/memories";

type Camera = { tx: number; ty: number; scale: number };
type UploadMode = { kind: "add"; date: string } | { kind: "replace"; date: string; photoId: string };

const MIN_SCALE = 0.2;
const MAX_SCALE = 1.8;
const DRAG_THRESHOLD = 6;
const DOT = 28;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

function shortDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * A pannable, zoomable canvas of every photo, one island per day. Inspired by
 * free-roaming "playground" galleries: drag (with momentum) or scroll to
 * wander, pinch / ctrl+scroll to zoom, tap a photo to open it.
 *
 * Camera updates write straight to the DOM (no React render per frame); React
 * only re-renders when a new island first comes near the viewport, which is
 * when its images start loading.
 */
export function MemoryBoard({ photos, today }: { photos: PhotoView[]; today: string }) {
  const clusters = useMemo(() => layoutMemories(photos), [photos]);
  const indexById = useMemo(() => new Map(photos.map((p, i) => [p.id, i])), [photos]);

  const boardRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const cam = useRef<Camera>({ tx: 0, ty: 0, scale: 1 });
  const anim = useRef<number | null>(null);
  const visTick = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastT: number;
    vx: number;
    vy: number;
    dragging: boolean;
    pinchDist?: number;
  } | null>(null);
  const suppressClick = useRef(false);

  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [hint, setHint] = useState(true);
  const [zoomPct, setZoomPct] = useState(100);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [upload, setUpload] = useState<UploadMode | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const updateVisibility = useCallback(() => {
    visTick.current = null;
    const board = boardRef.current;
    if (!board) return;
    const { tx, ty, scale } = cam.current;
    const w = board.clientWidth;
    const h = board.clientHeight;
    const margin = 500;
    const newly: string[] = [];
    for (const c of clusters) {
      const cx = tx + c.x * scale;
      const cy = ty + c.y * scale;
      const r = c.r * scale;
      if (cx + r > -margin && cx - r < w + margin && cy + r > -margin && cy - r < h + margin) newly.push(c.date);
    }
    setSeen((prev) => {
      if (newly.every((d) => prev.has(d))) return prev;
      const next = new Set(prev);
      newly.forEach((d) => next.add(d));
      return next;
    });
    setZoomPct(Math.round(scale * 100));
  }, [clusters]);

  const apply = useCallback(() => {
    const { tx, ty, scale } = cam.current;
    if (worldRef.current) worldRef.current.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
    if (boardRef.current) {
      boardRef.current.style.backgroundPosition = `${tx}px ${ty}px`;
      // Double the dot spacing when far out so the grid doesn't turn into fuzz.
      const dot = DOT * scale * (scale < 0.5 ? 2 : 1);
      boardRef.current.style.backgroundSize = `${dot}px ${dot}px`;
    }
    if (visTick.current === null) visTick.current = requestAnimationFrame(updateVisibility);
  }, [updateVisibility]);

  const stopAnim = useCallback(() => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  }, []);

  /** Zoom keeping the screen point (sx, sy) fixed under the cursor/fingers. */
  const zoomAt = useCallback(
    (sx: number, sy: number, nextScale: number) => {
      const c = cam.current;
      const s = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const wx = (sx - c.tx) / c.scale;
      const wy = (sy - c.ty) / c.scale;
      cam.current = { tx: sx - wx * s, ty: sy - wy * s, scale: s };
      apply();
    },
    [apply],
  );

  /** Smoothly fly the camera so world point (wx, wy) is centered at `scale`. */
  const flyTo = useCallback(
    (wx: number, wy: number, scale = cam.current.scale, ms = 650) => {
      const board = boardRef.current;
      if (!board) return;
      stopAnim();
      const from = { ...cam.current };
      const s = clamp(scale, MIN_SCALE, MAX_SCALE);
      const to = { tx: board.clientWidth / 2 - wx * s, ty: board.clientHeight / 2 - wy * s, scale: s };
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        cam.current = to;
        apply();
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = easeOut(Math.min(1, (now - start) / ms));
        cam.current = {
          tx: from.tx + (to.tx - from.tx) * t,
          ty: from.ty + (to.ty - from.ty) * t,
          scale: from.scale + (to.scale - from.scale) * t,
        };
        apply();
        anim.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      anim.current = requestAnimationFrame(step);
    },
    [apply, stopAnim],
  );

  const fitAll = useCallback(() => {
    const board = boardRef.current;
    if (!board || clusters.length === 0) return;
    const b = memoriesBounds(clusters);
    const s = Math.min(board.clientWidth / (b.maxX - b.minX), board.clientHeight / (b.maxY - b.minY)) * 0.9;
    flyTo((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, Math.min(1, s));
  }, [clusters, flyTo]);

  // Initial camera: newest day in the middle; a bit zoomed out on phones.
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const s = board.clientWidth < 640 ? 0.62 : 0.9;
    cam.current = { tx: board.clientWidth / 2, ty: board.clientHeight / 2, scale: s };
    apply();
    // Only on mount: later photo changes (router.refresh after an edit) keep the camera where it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    updateVisibility();
  }, [updateVisibility]);

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 9000);
    return () => clearTimeout(t);
  }, []);

  // Wheel needs a non-passive listener so it can stop the page from scrolling.
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnim();
      setHint(false);
      const rect = board.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX - rect.left, e.clientY - rect.top, cam.current.scale * Math.exp(-e.deltaY * 0.01));
      } else {
        const unit = e.deltaMode === 1 ? 16 : 1;
        cam.current.tx -= e.deltaX * unit;
        cam.current.ty -= e.deltaY * unit;
        apply();
      }
    };
    board.addEventListener("wheel", onWheel, { passive: false });
    return () => board.removeEventListener("wheel", onWheel);
  }, [apply, stopAnim, zoomAt]);

  useEffect(() => {
    const onResize = () => apply();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      stopAnim();
      if (visTick.current !== null) cancelAnimationFrame(visTick.current);
    };
  }, [apply, stopAnim]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    stopAnim();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    suppressClick.current = false;
    if (pointers.current.size === 1) {
      gesture.current = {
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        lastT: performance.now(),
        vx: 0,
        vy: 0,
        dragging: false,
      };
    } else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.lastX = (a.x + b.x) / 2;
      gesture.current.lastY = (a.y + b.y) / 2;
      gesture.current.dragging = true;
      boardRef.current?.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current;
    if (!g || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const board = boardRef.current!;

    if (pointers.current.size >= 2 && g.pinchDist) {
      const [a, b] = [...pointers.current.values()];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = board.getBoundingClientRect();
      cam.current.tx += mx - g.lastX;
      cam.current.ty += my - g.lastY;
      zoomAt(mx - rect.left, my - rect.top, cam.current.scale * (dist / g.pinchDist));
      g.pinchDist = dist;
      g.lastX = mx;
      g.lastY = my;
      g.vx = g.vy = 0;
      return;
    }

    if (!g.dragging && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > DRAG_THRESHOLD) {
      g.dragging = true;
      // Capture only once it's a real drag, so a plain tap still clicks the photo underneath.
      board.setPointerCapture(e.pointerId);
      board.dataset.dragging = "true";
      setHint(false);
    }
    if (!g.dragging) return;

    const now = performance.now();
    const dx = e.clientX - g.lastX;
    const dy = e.clientY - g.lastY;
    const dt = Math.max(1, now - g.lastT);
    // Smoothed velocity (px/ms) for the momentum fling.
    g.vx = g.vx * 0.6 + (dx / dt) * 0.4;
    g.vy = g.vy * 0.6 + (dy / dt) * 0.4;
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    g.lastT = now;
    cam.current.tx += dx;
    cam.current.ty += dy;
    apply();
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (pointers.current.size === 1) {
      // Pinch → one finger left: continue as a pan from where it is.
      const [p] = [...pointers.current.values()];
      g.pinchDist = undefined;
      g.lastX = p.x;
      g.lastY = p.y;
      g.lastT = performance.now();
      return;
    }
    if (pointers.current.size > 0) return;

    gesture.current = null;
    delete boardRef.current?.dataset.dragging;
    if (!g.dragging) return;
    suppressClick.current = true;

    // Momentum: keep gliding and bleed off speed (frame-rate independent).
    let { vx, vy } = g;
    if (performance.now() - g.lastT > 80) vx = vy = 0; // finger rested before lifting
    if (Math.hypot(vx, vy) < 0.05 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      const decay = Math.pow(0.995, dt);
      vx *= decay;
      vy *= decay;
      cam.current.tx += vx * dt;
      cam.current.ty += vy * dt;
      apply();
      anim.current = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    const step = 120;
    const board = boardRef.current!;
    const centerZoom = (f: number) => zoomAt(board.clientWidth / 2, board.clientHeight / 2, cam.current.scale * f);
    const moves: Record<string, () => void> = {
      ArrowLeft: () => (cam.current.tx += step),
      ArrowRight: () => (cam.current.tx -= step),
      ArrowUp: () => (cam.current.ty += step),
      ArrowDown: () => (cam.current.ty -= step),
      "+": () => centerZoom(1.2),
      "=": () => centerZoom(1.2),
      "-": () => centerZoom(1 / 1.2),
      "0": () => flyTo(0, 0, 1),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    stopAnim();
    setHint(false);
    move();
    apply();
  }

  function centeredZoom(factor: number) {
    const board = boardRef.current!;
    stopAnim();
    const c = cam.current;
    const wx = (board.clientWidth / 2 - c.tx) / c.scale;
    const wy = (board.clientHeight / 2 - c.ty) / c.scale;
    flyTo(wx, wy, c.scale * factor, 260);
  }

  function openPhoto(id: string, trigger: HTMLElement) {
    if (suppressClick.current) return;
    returnFocusTo.current = trigger;
    setLightbox(indexById.get(id) ?? 0);
  }

  function closeLightbox() {
    setLightbox(null);
    returnFocusTo.current?.focus({ preventScroll: true });
  }

  function closeUpload() {
    setUpload(null);
    returnFocusTo.current?.focus({ preventScroll: true });
  }

  const totalDays = clusters.length;

  return (
    <>
      <div
        ref={boardRef}
        role="application"
        aria-roledescription="memory board"
        aria-label="Memories. Drag or use arrow keys to explore, plus and minus to zoom, Tab to move between photos."
        tabIndex={0}
        className="memory-board fixed inset-0 z-0 overflow-hidden select-none focus-visible:outline-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.stopPropagation();
            e.preventDefault();
            suppressClick.current = false;
          }
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        <div ref={worldRef} className="absolute top-0 left-0 h-0 w-0 origin-top-left will-change-transform">
          {clusters.map((c) => (
            <Island
              key={c.date}
              cluster={c}
              today={today}
              loaded={seen.has(c.date)}
              onOpen={openPhoto}
              onSticker={() => flyTo(c.x, c.y, Math.max(cam.current.scale, 1))}
              onFocusPhoto={(x, y) => flyTo(c.x + x, c.y + y, Math.max(cam.current.scale, 0.8), 380)}
            />
          ))}
        </div>
      </div>

      {/* Overlay: title + controls. The wrapper ignores the pointer so the board stays draggable underneath. */}
      <div className="pointer-events-none fixed inset-x-0 top-[4.75rem] z-10 mx-auto flex max-w-[70rem] justify-between px-5 sm:top-[5.5rem]">
        <div className="clay pointer-events-auto px-4 py-2.5 sm:py-3">
          <p className="eyebrow">memory lane</p>
          <h1 className="font-display text-xl leading-tight font-semibold sm:text-2xl">Memories</h1>
          <p className="text-sm text-muted">
            {photos.length} {photos.length === 1 ? "photo" : "photos"} · {totalDays} {totalDays === 1 ? "day" : "days"}
          </p>
        </div>
      </div>

      {/* Fade under the header so wandering photos don't collide with the nav. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[1] h-28 bg-gradient-to-b from-paper via-paper/80 to-transparent" />

      <div
        className="pointer-events-none fixed inset-x-0 z-10 mx-auto flex max-w-[70rem] flex-col items-start gap-3 px-5 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] sm:bottom-6 sm:flex-row sm:items-end sm:justify-between"
      >
        <div
          aria-hidden={!hint}
          className={`transition-all duration-500 ${hint ? "opacity-100" : "translate-y-3 opacity-0"}`}
        >
          <div className="flex items-center gap-2">
            <Mascot mood="wave" size={60} />
            <p className="bubble w-max max-w-[14rem] text-sm leading-snug font-semibold text-ink-soft">
              Drag around to explore. Each island is one day.
            </p>
          </div>
        </div>
        <div className="clay pointer-events-auto flex items-center gap-1 p-1.5" role="toolbar" aria-label="Board controls">
          <button type="button" className="grid size-10 place-items-center rounded-full text-xl font-bold text-ink-soft hover:bg-paper-deep" onClick={() => centeredZoom(1 / 1.35)} aria-label="Zoom out">
            −
          </button>
          <span className="hidden w-11 text-center text-xs font-bold text-muted tabular-nums sm:inline" aria-live="polite">{zoomPct}%</span>
          <button type="button" className="grid size-10 place-items-center rounded-full text-xl font-bold text-ink-soft hover:bg-paper-deep" onClick={() => centeredZoom(1.35)} aria-label="Zoom in">
            +
          </button>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden />
          <button type="button" className="rounded-full px-3 py-2 text-sm font-bold text-ink-soft hover:bg-paper-deep" onClick={fitAll}>
            All
          </button>
          <button type="button" className="rounded-full bg-teal px-3.5 py-2 text-[15px] font-bold text-white hover:bg-ocean" onClick={() => flyTo(0, 0, 1)}>
            Latest
          </button>
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
        <UploadSheet key={upload.kind === "replace" ? upload.photoId : upload.date} mode={upload} onClose={closeUpload} />
      )}
    </>
  );
}

const TINT_CLASS = {
  white: "tint-white",
  aqua: "tint-aqua",
} as const;

function Island({
  cluster,
  today,
  loaded,
  onOpen,
  onSticker,
  onFocusPhoto,
}: {
  cluster: MemoryCluster<PhotoView>;
  today: string;
  loaded: boolean;
  onOpen: (id: string, trigger: HTMLElement) => void;
  onSticker: () => void;
  onFocusPhoto: (x: number, y: number) => void;
}) {
  const { date, x, y, r, tint, sticker, photos } = cluster;
  const isToday = date === today;
  return (
    <section aria-label={`${formatEthiopian(date)}, ${photos.length} ${photos.length === 1 ? "photo" : "photos"}`} className="absolute" style={{ left: x, top: y }}>
      {/* the island itself: a soft pastel blob the day's photos sit on */}
      <div
        aria-hidden
        className={`${TINT_CLASS[tint]} memory-island absolute`}
        style={{ left: -r * 0.92, top: -r * 0.84, width: r * 1.84, height: r * 1.68, rotate: `${sticker.rotate * 3}deg` }}
      />

      {photos.map(({ photo, x: px, y: py, width, rotate }, i) => (
        <button
          key={photo.id}
          type="button"
          onClick={(e) => onOpen(photo.id, e.currentTarget)}
          onFocus={(e) => {
            if (e.currentTarget.matches(":focus-visible")) onFocusPhoto(px, py);
          }}
          aria-label={`${photo.caption ?? "Photo"}, ${shortDate(date)}. Open photo`}
          className="memory-photo absolute cursor-pointer hover:scale-[1.06] focus-visible:scale-[1.06]"
          style={{
            left: px,
            top: py,
            width,
            transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
          }}
        >
          {loaded ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.thumbUrl}
              alt=""
              draggable={false}
              decoding="async"
              className="animate-pop-in block w-full rounded-[0.7rem] bg-paper-deep"
              style={{ animationDelay: `${i * 45}ms`, minHeight: 60 }}
            />
          ) : (
            <span className="block aspect-[4/5] w-full rounded-[0.7rem] bg-paper-deep" />
          )}
          {photo.caption && (
            <span className="mt-1.5 block truncate px-0.5 text-left font-hand text-[17px] leading-tight text-ink-soft">
              {photo.caption}
            </span>
          )}
        </button>
      ))}

      <button
        type="button"
        onClick={onSticker}
        tabIndex={-1}
        aria-hidden
        className={`memory-sticker absolute z-[6] bg-white cursor-pointer px-4 py-2.5 text-center whitespace-nowrap`}
        style={{ left: sticker.x, top: sticker.y, transform: `translate(-50%, -50%) rotate(${sticker.rotate}deg)` }}
      >
        <span className="block text-[11px] font-extrabold tracking-wider text-accent uppercase">
          {isToday ? "today" : shortDate(date)}
        </span>
        <span className="block font-display text-lg leading-tight font-semibold text-ink">{formatEthiopian(date)}</span>
        {photos.length > 1 && <span className="block text-xs font-bold text-muted">{photos.length} photos</span>}
      </button>
    </section>
  );
}
