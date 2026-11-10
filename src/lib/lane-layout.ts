/**
 * Where the photos go on a Memory Lane share picture (a day, a week or a month): a loose grid of
 * framed photos, each as big as the picture allows while every one of them stays whole and in
 * view. Slightly scattered and tilted, like the board, but never overlapping. Pure, for the
 * share picture (src/components/memories/snapshot.ts) and its tests.
 */

export type Area = { x: number; y: number; w: number; h: number };

/** One photo's place: its center, its frame width, and its tilt in degrees. */
export type LaneSlot = { x: number; y: number; width: number; rotate: number };

/** A frame is this many times taller than wide (a square photo, a border, room for a caption). */
export const FRAME_RATIO = 1.22;
/** The share of a cell a frame fills; the rest is breathing room for the tilt and scatter. */
const FILL = 0.86;
/** A lone photo still leaves sky around it. */
const MAX_SHARE_OF_AREA = 0.82;

/** Repeatable "random" in [-1, 1] for slot `i`, so the same photos always land the same way. */
export function wobble(i: number, salt: number) {
  const s = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** How many columns give the biggest frames for `n` photos in `area`. */
export function bestColumns(n: number, area: Pick<Area, "w" | "h">) {
  let best = { cols: 1, width: 0 };
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const rows = Math.ceil(n / cols);
    const width = Math.min((area.w / cols) * FILL, ((area.h / rows) * FILL) / FRAME_RATIO);
    if (width > best.width + 0.01) best = { cols, width };
  }
  return best;
}

/**
 * Lays out `n` frames in `area`, in reading order (left to right, top to bottom). The last row is
 * centered when it isn't full. Scatter and tilt stay inside each cell, so nothing overlaps or
 * leaves the area.
 */
export function laneLayout(n: number, area: Area): LaneSlot[] {
  if (n <= 0) return [];
  const { cols, width: fitted } = bestColumns(n, area);
  const width = Math.min(fitted, area.w * MAX_SHARE_OF_AREA, (area.h * MAX_SHARE_OF_AREA) / FRAME_RATIO);
  const rows = Math.ceil(n / cols);
  const cellW = area.w / cols;
  const cellH = area.h / rows;
  // Rows sit together in the middle when frames are smaller than their cells (few photos).
  const rowH = Math.min(cellH, (width * FRAME_RATIO) / FILL);
  const top = area.y + (area.h - rowH * rows) / 2;
  // Room left in a cell around a tilted frame, for the scatter.
  const tilt = 5;
  const reachX = (width + width * FRAME_RATIO * Math.sin((tilt * Math.PI) / 180)) / 2;
  const reachY = (width * FRAME_RATIO + width * Math.sin((tilt * Math.PI) / 180)) / 2;
  const slackX = Math.max(0, cellW / 2 - reachX) * 0.6;
  const slackY = Math.max(0, rowH / 2 - reachY) * 0.6;

  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const col = i % cols;
    const rowLeft = area.x + (area.w - inRow * cellW) / 2;
    return {
      x: rowLeft + (col + 0.5) * cellW + wobble(i, 1) * slackX,
      y: top + (row + 0.5) * rowH + wobble(i, 2) * slackY,
      width,
      rotate: n === 1 ? -2 : wobble(i, 3) * tilt,
    };
  });
}

/**
 * Which photos make the picture when there are more than fit: every day's first photo (its
 * wallpaper), then the rest in order, up to `max`. Keeps the original order.
 */
export function pickForPicture<T extends { date: string }>(photos: T[], max: number): T[] {
  if (photos.length <= max) return photos;
  const keep = new Set<T>();
  const seenDays = new Set<string>();
  for (const p of photos) {
    if (keep.size >= max) break;
    if (!seenDays.has(p.date)) {
      seenDays.add(p.date);
      keep.add(p);
    }
  }
  for (const p of photos) {
    if (keep.size >= max) break;
    keep.add(p);
  }
  return photos.filter((p) => keep.has(p));
}
