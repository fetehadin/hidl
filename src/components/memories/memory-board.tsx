"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { VideoBadge } from "@/components/calendar/video-badge";
import { Lightbox, UploadSheet, usePreloadPhotoTools } from "@/components/calendar/lazy";
import type { PhotoView } from "@/lib/data/photos";
import { useCalendarPref } from "@/components/calendar-pref";
import { ShareIcon, GatherIcon } from "@/components/icons";
import { Mascot } from "@/components/mascot";
import { formatEthiopianDay } from "@/lib/ethiopian";
import {
  type MemoryCluster,
  type MemoryGroupBy,
  UNSORTED,
  boardRegion,
  clampToRegion,
  layoutMemories,
  memoriesBounds,
} from "@/lib/memories";
import type { PhotoGroup } from "@/lib/photo-groups";
import { setPhotoGroupList } from "@/components/calendar/photo-groups-store";
import { GroupsSheet } from "./groups-sheet";
import { ShareSheet, type SharedView } from "./share-sheet";

type Camera = { tx: number; ty: number; scale: number };
type UploadMode = { kind: "add"; date: string } | { kind: "replace"; date: string; photoId: string };

const MIN_SCALE = 0.2;
const MAX_SCALE = 1.8;
const DRAG_THRESHOLD = 6;
/**
 * How far (screen px) a drag can pull the board past its edge. It gets stiffer the further you
 * pull and springs back on release, so the edge is felt rather than hit like a wall.
 */
const MAX_PULL = 72;
/**
 * How far past the screen edge islands start loading. 0 on first paint, so a phone on a slow
 * connection spends it on the photos you can actually see; widened once those are in.
 */
const PRELOAD_MARGIN = 500;
/**
 * The part of the world (around the newest day, where the camera starts) whose photos are in
 * the server-rendered HTML. Covers a phone (starts at 62% zoom) and a laptop (90%). Those
 * start downloading while the page's JavaScript is still loading, instead of after it (on a
 * slow phone that was a second of empty placeholders).
 */
const FIRST_VIEW = {
  // A 390×844 phone at 62%: ±315 × ±680 world px.
  phone: { halfW: 340, halfH: 700 },
  // Up to a 1600×1000 window at 90%.
  wide: { halfW: 900, halfH: 560 },
};

function inFirstView(c: MemoryCluster<unknown>, phone: boolean) {
  const box = phone ? FIRST_VIEW.phone : FIRST_VIEW.wide;
  return Math.abs(c.x) - c.r < box.halfW && Math.abs(c.y) - c.r < box.halfH;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

function weekday(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleString("en-US", { weekday: "long", timeZone: "UTC" });
}

function shortDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/** An island's sticker: a small line above, the big line, and an optional count below. */
export type StickerText = { small: string; big: string; count?: string };

export function stickerText(
  cluster: MemoryCluster<PhotoView>,
  by: MemoryGroupBy,
  today: string,
  ethiopian: boolean,
  groupNames: Map<string, string>,
): StickerText {
  const n = cluster.photos.length;
  if (by === "group") {
    if (cluster.key === UNSORTED) return { small: "tap a photo to add it", big: "Not in a group", count: plural(n, "photo") };
    return { small: plural(n, "photo"), big: groupNames.get(cluster.key) ?? "Group" };
  }
  const date = cluster.key;
  // Big line in the chosen calendar; the small line above it is the Gregorian date
  // (Ethiopian mode) or the weekday (Gregorian mode).
  const big = ethiopian ? formatEthiopianDay(date) : shortDate(date);
  const small = date === today ? "today" : ethiopian ? shortDate(date) : weekday(date);
  return { small, big, count: n > 1 ? plural(n, "photo") : undefined };
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
export function MemoryBoard({
  photos,
  today,
  phone,
  groupBy,
  groups,
}: {
  photos: PhotoView[];
  today: string;
  phone: boolean;
  /** How the page was asked for (`?by=group`); the toggle switches it without a reload. */
  groupBy: MemoryGroupBy;
  /** The person's own groups, in their order (first = the middle of the board). */
  groups: PhotoGroup[];
}) {
  usePreloadPhotoTools();
  const ethiopian = useCalendarPref() === "ethiopian";
  const [by, setBy] = useState<MemoryGroupBy>(groupBy);
  /** Which camera button matches the view: the whole board, its middle island, or neither once moved by hand. */
  const [view, setView] = useState<"all" | "home" | null>("home");
  const groupOrder = useMemo(() => groups.map((g) => g.id), [groups]);
  const groupNames = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const clusters = useMemo(() => layoutMemories(photos, by, groupOrder), [photos, by, groupOrder]);
  // Pickers in the photo viewer and upload sheet read the groups from here, without asking again.
  useLayoutEffect(() => setPhotoGroupList(groups), [groups]);
  const photoById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

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

  /** Islands near where the camera starts: in the HTML, and fetched first (high priority). */
  const firstView = useMemo(() => new Set(clusters.filter((c) => inFirstView(c, phone)).map((c) => c.key)), [clusters, phone]);
  const [seen, setSeen] = useState<Set<string>>(() => new Set(firstView));
  const margin = useRef(0);
  const [hint, setHint] = useState(true);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The open photo, and the photos Prev / Next walk through: every photo by day, the island's by
   * group. Kept as ids so a refreshed list (a caption, a deletion) shows fresh data in the same order.
   */
  const [lightbox, setLightbox] = useState<{ ids: string[]; index: number } | null>(null);
  /** The view being shared (camera and screen size when Share was tapped), while its sheet is open. */
  const [sharing, setSharing] = useState<SharedView | null>(null);
  const [editingGroups, setEditingGroups] = useState(false);
  /** The small "Gather photos" menu above the controls (by day / by group / edit groups). */
  const [menuOpen, setMenuOpen] = useState(false);
  /** By group: the list of groups to fly to, opened from the group button. */
  const [pickerOpen, setPickerOpen] = useState(false);
  /** By group: the island the group button goes to; null = the first one (the middle of the board). */
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadMode | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const updateVisibility = useCallback(() => {
    visTick.current = null;
    const board = boardRef.current;
    if (!board) return;
    const { tx, ty, scale } = cam.current;
    const w = board.clientWidth;
    const h = board.clientHeight;
    const m = margin.current;
    const newly: string[] = [];
    for (const c of clusters) {
      const cx = tx + c.x * scale;
      const cy = ty + c.y * scale;
      const r = c.r * scale;
      if (cx + r > -m && cx - r < w + m && cy + r > -m && cy - r < h + m) newly.push(c.key);
    }

    setSeen((prev) => {
      if (newly.every((d) => prev.has(d))) return prev;
      const next = new Set(prev);
      newly.forEach((d) => next.add(d));
      return next;
    });
  }, [clusters]);

  /** Where the middle of the screen may go (world units): over the photos, never off into empty sky. */
  const region = useMemo(() => boardRegion(clusters), [clusters]);

  /**
   * How far the middle of the screen is past the edge: `over` in screen px, and the world point
   * it should be at. Zero inside.
   */
  const overshoot = useCallback(() => {
    const board = boardRef.current;
    const c = cam.current;
    if (!board) return { over: 0, wx: 0, wy: 0, inside: { x: 0, y: 0 } };
    const wx = (board.clientWidth / 2 - c.tx) / c.scale;
    const wy = (board.clientHeight / 2 - c.ty) / c.scale;
    const inside = clampToRegion(region, wx, wy);
    return { over: Math.hypot(wx - inside.x, wy - inside.y) * c.scale, wx, wy, inside };
  }, [region]);

  /**
   * Moves the world layer to the camera. Firm (the default) keeps the middle of the screen inside
   * the board; `elastic` (a drag, a spring back) lets it out by at most MAX_PULL.
   */
  const apply = useCallback(
    (elastic = false) => {
      const board = boardRef.current;
      const { over, wx, wy, inside } = overshoot();
      if (board && over > 0 && (!elastic || over > MAX_PULL)) {
        const keep = elastic ? MAX_PULL / over : 0;
        const c = cam.current;
        c.tx = board.clientWidth / 2 - (inside.x + (wx - inside.x) * keep) * c.scale;
        c.ty = board.clientHeight / 2 - (inside.y + (wy - inside.y) * keep) * c.scale;
      }
      const { tx, ty, scale } = cam.current;
      // Only the world layer moves (a compositor-only transform); the sky behind it stays put,
      // so a pan never repaints the whole screen.
      if (worldRef.current) worldRef.current.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`;
      if (visTick.current === null) visTick.current = requestAnimationFrame(updateVisibility);
    },
    [updateVisibility, overshoot],
  );

  /** A drag by (dx, dy) screen px: free inside, stiffer and stiffer past the edge. */
  const pan = useCallback(
    (dx: number, dy: number) => {
      const c = cam.current;
      const { over, wx, wy, inside } = overshoot();
      if (over > 0) {
        // The part of the move that pulls further out is damped; moving back in or along the edge isn't.
        const ox = (wx - inside.x) / (over / c.scale);
        const oy = (wy - inside.y) / (over / c.scale);
        const out = -(dx * ox + dy * oy); // the screen center moves opposite to the finger
        if (out > 0) {
          const give = (1 - Math.min(1, over / MAX_PULL)) ** 2;
          dx += ox * out * (1 - give);
          dy += oy * out * (1 - give);
        }
      }
      c.tx += dx;
      c.ty += dy;
      apply(true);
    },
    [apply, overshoot],
  );

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
        // Elastic on the way (a spring back starts outside the edge), firm on arrival.
        apply(t < 1);
        anim.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      anim.current = requestAnimationFrame(step);
    },
    [apply, stopAnim],
  );

  /** After a drag or fling that ended past the edge: ease back inside. */
  const springBack = useCallback(() => {
    const { over, inside } = overshoot();
    if (over > 0.5) flyTo(inside.x, inside.y, cam.current.scale, 380);
    else apply();
  }, [overshoot, flyTo, apply]);

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

  // Switching between days and groups is a new layout: start again from its middle island.
  const firstLayout = useRef(true);
  useLayoutEffect(() => {
    if (firstLayout.current) {
      firstLayout.current = false;
      return;
    }
    stopAnim();
    const board = boardRef.current;
    if (!board) return;
    const c = cam.current;
    cam.current = { tx: board.clientWidth / 2, ty: board.clientHeight / 2, scale: c.scale };
    apply();
    setView("home");
    setPickedKey(null);
    setPickerOpen(false);
    // Only when the grouping changes, not when the photos refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [by]);

  useEffect(() => {
    updateVisibility();
  }, [updateVisibility]);

  // Once the first screenful of photos has loaded (or after a few seconds on a very slow
  // connection), start loading the islands just off screen too.
  useEffect(() => {
    let cancelled = false;
    let idle: number | undefined;
    const widen = () => {
      if (cancelled) return;
      margin.current = PRELOAD_MARGIN;
      updateVisibility();
    };
    const pending = [...(boardRef.current?.querySelectorAll<HTMLImageElement>('img[fetchpriority="high"]') ?? [])]
      .filter((img) => !img.complete)
      .map((img) => new Promise((done) => {
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }));
    const timeout = new Promise((done) => setTimeout(done, 4000));
    Promise.race([Promise.all(pending), timeout]).then(() => {
      if (cancelled) return;
      if ("requestIdleCallback" in window) idle = requestIdleCallback(widen, { timeout: 1000 });
      else widen();
    });
    return () => {
      cancelled = true;
      if (idle !== undefined) cancelIdleCallback(idle);
    };
  }, [updateVisibility]);

  useEffect(() => {
    hintTimer.current = setTimeout(() => setHint(false), 9000);
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);

  function switchGroup(next: MemoryGroupBy) {
    if (next === by) return;
    setBy(next);
    // Remember it in the address (a reload or Back keeps it), without asking the server again.
    const url = new URL(window.location.href);
    if (next === "group") url.searchParams.set("by", "group");
    else url.searchParams.delete("by");
    window.history.replaceState(window.history.state, "", url);
    // Say once what an island means now.
    setHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), 6000);
  }

  // Wheel needs a non-passive listener so it can stop the page from scrolling.
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopAnim();
      setHint(false);
      setView(null);
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
      setView(null);
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
      setView(null);
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
    pan(dx, dy);
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
    if (Math.hypot(vx, vy) < 0.05 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      springBack();
      return;
    }
    let last = performance.now();
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      const decay = Math.pow(0.995, dt);
      vx *= decay;
      vy *= decay;
      pan(vx * dt, vy * dt);
      // Gliding into the edge: stop there and ease back, like a pull.
      if (overshoot().over > 0) {
        anim.current = null;
        springBack();
        return;
      }
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
    const home = e.key === "0";
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    stopAnim();
    setHint(false);
    setView(home ? "home" : null);
    if (home) setPickedKey(null);
    move();
    apply();
  }

  /** The camera buttons: the whole board, or back to its middle island (newest day). */
  function showView(key: "all" | "home") {
    if (key === "all") fitAll();
    else flyTo(0, 0, 1);
    setView(key);
  }

  /** By group: fly to one group's island, and make it what the group button stands for. */
  function showGroup(cluster: MemoryCluster<PhotoView>) {
    flyTo(cluster.x, cluster.y, Math.max(cam.current.scale, 0.8));
    setPickedKey(cluster.key);
    setView("home");
    setPickerOpen(false);
  }

  function openPhoto(cluster: MemoryCluster<PhotoView>, id: string, trigger: HTMLElement) {
    if (suppressClick.current) return;
    returnFocusTo.current = trigger;
    const ids = by === "group" ? cluster.photos.map((p) => p.photo.id) : photos.map((p) => p.id);
    setLightbox({ ids, index: Math.max(0, ids.indexOf(id)) });
  }

  function share() {
    const board = boardRef.current;
    if (!board) return;
    stopAnim();
    setSharing({ ...cam.current, width: board.clientWidth, height: board.clientHeight });
  }

  function closeLightbox() {
    setLightbox(null);
    returnFocusTo.current?.focus({ preventScroll: true });
  }

  function closeUpload() {
    setUpload(null);
    returnFocusTo.current?.focus({ preventScroll: true });
  }

  const picked = (pickedKey && clusters.find((c) => c.key === pickedKey)) || clusters[0];
  const islandName = (key: string) => (key === UNSORTED ? "Not in a group" : (groupNames.get(key) ?? "Group"));
  const groupLabel = picked ? islandName(picked.key) : "Groups";
  /** Groups with no photos yet have no island to fly to; listed greyed out so none seem lost. */
  const emptyGroups = groups.filter((g) => !clusters.some((c) => c.key === g.id));

  const lightboxPhotos = lightbox ? lightbox.ids.flatMap((id) => photoById.get(id) ?? []) : [];
  const lightboxIndex = lightbox ? Math.min(lightbox.index, lightboxPhotos.length - 1) : -1;
  const summary =
    by === "group"
      ? `${plural(photos.length, "photo")} · ${plural(groups.length, "group")}`
      : `${plural(photos.length, "photo")} · ${plural(clusters.length, "day")}`;

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
        <SkyClouds />
        <div ref={worldRef} className="absolute top-0 left-0 h-0 w-0 origin-top-left will-change-transform">
          {clusters.map((c) => (
            <Island
              key={c.key}
              cluster={c}
              sticker={stickerText(c, by, today, ethiopian, groupNames)}
              loaded={seen.has(c.key)}
              eager={firstView.has(c.key)}
              onOpen={(id, trigger) => openPhoto(c, id, trigger)}
              onSticker={() => flyTo(c.x, c.y, Math.max(cam.current.scale, 1))}
              onFocusPhoto={(x, y) => flyTo(c.x + x, c.y + y, Math.max(cam.current.scale, 0.8), 380)}
            />
          ))}
        </div>
      </div>

      {/* Overlay: title + controls. The wrapper ignores the pointer so the board stays draggable underneath. */}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(4.5rem+var(--safe-top))] z-10 mx-auto flex max-w-[70rem] justify-between px-4 min-[400px]:px-5 sm:top-[5.5rem] sm:left-[var(--nav-w,0px)]">
        <div className="clay pointer-events-auto px-4 py-2.5 sm:py-3">
          <p className="eyebrow">memory lane</p>
          <h1 className="font-title text-xl leading-tight font-medium sm:text-2xl">Memories</h1>
          <p className="text-sm text-muted">{summary}</p>
        </div>
      </div>

      {/* Fade under the header so wandering photos don't collide with the nav. */}
      <div aria-hidden className="memory-sky-fade pointer-events-none fixed inset-x-0 top-0 z-[1] h-28" />

      <div
        className="pointer-events-none fixed inset-x-0 z-10 mx-auto flex max-w-[70rem] flex-col items-start gap-3 px-4 min-[400px]:px-5 bottom-[calc(5.75rem+var(--safe-bottom))] sm:left-[var(--nav-w,0px)] sm:bottom-6 sm:flex-row sm:items-end sm:justify-between sm:pr-24"
      >
        <div
          aria-hidden={!hint}
          className={`transition-all duration-500 ${hint ? "opacity-100" : "translate-y-3 opacity-0"}`}
        >
          <div className="flex items-center gap-2">
            <Mascot mood="wave" size={60} />
            <p className="bubble w-max max-w-[14rem] text-sm leading-snug font-semibold text-ink-soft">
              {by === "group"
                ? groups.length === 0
                  ? "Make a group, then tap a photo to put it in."
                  : "Each island is one of your groups. Tap a photo to change its groups."
                : "Drag around to explore. Each island is one day."}
            </p>
          </div>
        </div>
        <div className="pointer-events-auto relative">
          {menuOpen && (
            <>
              {/* Tapping anywhere else closes the menu. */}
              <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-0 cursor-default" onClick={() => setMenuOpen(false)} />
              <div
                id="memory-gather-menu"
                role="menu"
                aria-label="Gather photos"
                className="clay absolute bottom-full left-0 z-10 mb-2 w-56 p-1.5"
                onKeyDown={(e) => e.key === "Escape" && setMenuOpen(false)}
              >
                <p className="px-3 pt-1.5 pb-1 text-[11px] font-extrabold tracking-wider text-muted uppercase">Gather photos</p>
                {(["day", "group"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="menuitemradio"
                    aria-checked={by === option}
                    onClick={() => {
                      switchGroup(option);
                      setMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-left text-sm font-bold ${
                      by === option ? "bg-teal text-accent-ink" : "text-ink-soft hover:bg-paper-deep"
                    }`}
                  >
                    {option === "day" ? "By day" : "By group"}
                    {by === option && <span aria-hidden>✓</span>}
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditingGroups(true);
                  }}
                  className="mt-1 w-full rounded-full px-3 py-2 text-left text-sm font-bold text-ocean hover:bg-mint"
                >
                  {groups.length === 0 ? "+ Make your first group" : "Edit groups"}
                </button>
              </div>
            </>
          )}
          {pickerOpen && by === "group" && (
            <>
              <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-0 cursor-default" onClick={() => setPickerOpen(false)} />
              <div
                id="memory-group-picker"
                role="menu"
                aria-label="Go to a group"
                className="clay absolute bottom-full left-0 z-10 mb-2 flex max-h-[min(22rem,50vh)] w-64 flex-col p-1.5"
                onKeyDown={(e) => e.key === "Escape" && setPickerOpen(false)}
              >
                <p className="px-3 pt-1.5 pb-1 text-[11px] font-extrabold tracking-wider text-muted uppercase">Go to a group</p>
                <div className="min-h-0 overflow-y-auto overscroll-contain">
                  {clusters.map((c) => {
                    const current = view === "home" && c.key === picked?.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        role="menuitemradio"
                        aria-checked={current}
                        onClick={() => showGroup(c)}
                        className={`flex w-full items-center gap-2 rounded-full px-3 py-2 text-left text-sm font-bold ${
                          current ? "bg-teal text-accent-ink" : "text-ink-soft hover:bg-paper-deep"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">{islandName(c.key)}</span>
                        <span className={`shrink-0 text-xs font-semibold ${current ? "" : "text-muted"}`}>{c.photos.length}</span>
                        {current && <span aria-hidden>✓</span>}
                      </button>
                    );
                  })}
                  {emptyGroups.map((g) => (
                    <div key={g.id} role="menuitem" aria-disabled className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-muted">
                      <span className="min-w-0 flex-1 truncate">{g.name}</span>
                      <span className="shrink-0 text-xs font-semibold">empty</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPickerOpen(false);
                    setEditingGroups(true);
                  }}
                  className="mt-1 w-full shrink-0 rounded-full px-3 py-2 text-left text-sm font-bold text-ocean hover:bg-mint"
                >
                  {groups.length === 0 ? "+ Make your first group" : "Edit groups"}
                </button>
              </div>
            </>
          )}
          <div className="clay relative flex items-center gap-1 p-1.5" role="toolbar" aria-label="Board controls">
            <button
              type="button"
              className={`grid size-10 place-items-center rounded-full hover:bg-paper-deep ${by === "group" ? "text-accent" : "text-ink-soft"}`}
              onClick={() => {
                setPickerOpen(false);
                setMenuOpen((o) => !o);
              }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? "memory-gather-menu" : undefined}
              aria-label={`Gather photos: ${by === "group" ? "by group" : "by day"}`}
              title="Gather photos by day or by group"
            >
              <GatherIcon width={20} height={20} />
            </button>
            <span className="mx-0.5 h-6 w-px bg-line" aria-hidden />
            {(["all", "home"] as const).map((key) =>
              key === "home" && by === "group" ? (
                <button
                  key={key}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={pickerOpen}
                  aria-controls={pickerOpen ? "memory-group-picker" : undefined}
                  aria-label={`Go to a group: ${groupLabel}`}
                  className={`flex max-w-[11rem] items-center gap-1 rounded-full py-2 pr-2.5 pl-3.5 text-sm font-bold transition-colors ${
                    view === key ? "bg-teal text-accent-ink" : "text-ink-soft hover:bg-paper-deep"
                  }`}
                  onClick={() => {
                    setMenuOpen(false);
                    setPickerOpen((o) => !o);
                  }}
                >
                  <span className="truncate">{groupLabel}</span>
                  <svg aria-hidden viewBox="0 0 20 20" width={16} height={16} className={`shrink-0 transition-transform ${pickerOpen ? "rotate-180" : ""}`}>
                    <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  className={`rounded-full px-3.5 py-2 text-sm font-bold transition-colors ${
                    view === key ? "bg-teal text-accent-ink" : "text-ink-soft hover:bg-paper-deep"
                  }`}
                  onClick={() => showView(key)}
                >
                  {key === "all" ? "All" : "Latest"}
                </button>
              ),
            )}
            <span className="mx-0.5 h-6 w-px bg-line" aria-hidden />
            <button
              type="button"
              className="grid size-10 place-items-center rounded-full text-ocean hover:bg-mint"
              onClick={share}
              aria-label="Share as a picture"
              title="Share as a picture"
            >
              <ShareIcon width={20} height={20} />
            </button>
          </div>
        </div>
      </div>

      {lightbox !== null && lightboxIndex >= 0 && (
        <Lightbox
          photos={lightboxPhotos}
          dayPhotos={photos}
          index={lightboxIndex}
          onIndex={(index) => setLightbox((l) => (l ? { ...l, index } : l))}
          onClose={closeLightbox}
          onReplace={(photoId) => {
            const date = lightboxPhotos[lightboxIndex].date;
            setLightbox(null);
            setUpload({ kind: "replace", date, photoId });
          }}
          onAddAnother={(date) => {
            setLightbox(null);
            setUpload({ kind: "add", date });
          }}
        />
      )}
      {sharing && (
        <ShareSheet
          screen={{
            boardRef,
            view: sharing,
            clusters,
            stickers: clusters.map((c) => stickerText(c, by, today, ethiopian, groupNames)),
            title: by === "group" ? "Memories by group" : "Memories",
            summary,
          }}
          initialMode="day"
          initialDate={photos[photos.length - 1]?.date ?? today}
          today={today}
          onClose={() => setSharing(null)}
        />
      )}
      {editingGroups && (
        <GroupsSheet counts={groupCounts(photos)} onClose={() => setEditingGroups(false)} />
      )}
      {upload && (
        <UploadSheet key={upload.kind === "replace" ? upload.photoId : upload.date} mode={upload} onClose={closeUpload} />
      )}
    </>
  );
}

/** How many photos each group has, for the groups sheet. */
function groupCounts(photos: PhotoView[]) {
  const counts = new Map<string, number>();
  for (const p of photos) for (const g of p.groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  return counts;
}

/**
 * Clouds drifting across the sky, behind the photos. Pictures, not CSS shapes: rendered offline
 * (a heap of lit, self-shadowing puffs, see scripts/generate-clouds.mjs) so they look like real
 * cumulus. They're fixed to the screen rather than the world, so panning never moves them, and
 * the drift is a CSS animation of `translate` only, which the compositor runs without touching
 * the main thread. A negative delay spreads them across the sky from the first frame; with
 * reduced motion they stay where they start.
 */
const SKY_CLOUDS = [
  { variant: 1, top: "9%", width: "min(52vw, 460px)", seconds: 210, at: 0.15, flip: false, opacity: 0.95 },
  { variant: 3, top: "34%", width: "min(34vw, 300px)", seconds: 300, at: 0.62, flip: true, opacity: 0.8 },
  { variant: 2, top: "55%", width: "min(60vw, 540px)", seconds: 240, at: 0.88, flip: false, opacity: 0.9 },
  { variant: 4, top: "76%", width: "min(40vw, 360px)", seconds: 270, at: 0.4, flip: false, opacity: 0.85 },
  { variant: 1, top: "22%", width: "min(26vw, 220px)", seconds: 360, at: 0.78, flip: true, opacity: 0.7 },
] as const;

function SkyClouds() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {SKY_CLOUDS.map((c, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={`/clouds/cumulus-${c.variant}.webp`}
          alt=""
          draggable={false}
          decoding="async"
          fetchPriority="low"
          className="memory-sky-cloud absolute left-0 max-w-none select-none"
          style={{
            top: c.top,
            width: c.width,
            opacity: c.opacity,
            scale: c.flip ? "-1 1" : undefined,
            animationDuration: `${c.seconds}s`,
            animationDelay: `${-c.at * c.seconds}s`,
            ["--at" as string]: c.at,
          }}
        />
      ))}
    </div>
  );
}

function Island({
  cluster,
  sticker: text,
  loaded,
  eager,
  onOpen,
  onSticker,
  onFocusPhoto,
}: {
  cluster: MemoryCluster<PhotoView>;
  sticker: StickerText;
  loaded: boolean;
  /** On screen at first paint: fetch these photos before anything else. */
  eager: boolean;
  onOpen: (id: string, trigger: HTMLElement) => void;
  onSticker: () => void;
  onFocusPhoto: (x: number, y: number) => void;
}) {
  const { x, y, sticker, photos } = cluster;
  return (
    <section aria-label={`${text.big}, ${plural(photos.length, "photo")}`} className="absolute" style={{ left: x, top: y }}>
      {photos.map(({ photo, x: px, y: py, width, rotate }, i) => (
        <button
          key={photo.id}
          type="button"
          onClick={(e) => onOpen(photo.id, e.currentTarget)}
          onFocus={(e) => {
            if (e.currentTarget.matches(":focus-visible")) onFocusPhoto(px, py);
          }}
          aria-label={`${photo.caption ?? "Photo"}, ${shortDate(photo.date)}. Open photo`}
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
              fetchPriority={eager ? "high" : "low"}
              className="animate-pop-in block w-full rounded-[0.7rem] bg-paper-deep"
              style={{ animationDelay: `${i * 45}ms`, minHeight: 60 }}
            />
          ) : (
            <span className="block aspect-[4/5] w-full rounded-[0.7rem] bg-paper-deep" />
          )}
          {photo.isVideo && loaded && <VideoBadge className="absolute top-2 left-2" />}
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
        <span className="block text-[11px] font-extrabold tracking-wider text-accent uppercase">{text.small}</span>
        <span className="block font-display text-lg leading-tight font-semibold text-heading">{text.big}</span>
        {text.count && <span className="block text-xs font-bold text-muted">{text.count}</span>}
      </button>
    </section>
  );
}
