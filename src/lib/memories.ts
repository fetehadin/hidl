/**
 * Layout for the memories board: every day becomes one "island" of photos, and
 * islands are packed outward along a spiral with the most recent day at the
 * center (world origin). Pure and deterministic (seeded by the date and photo
 * ids), so the board looks the same on every visit and on the server.
 */

export type MemoryTint = "white" | "aqua";

export type PlacedPhoto<T> = {
  photo: T;
  /** Center of the photo card, relative to its cluster's center. */
  x: number;
  y: number;
  width: number;
  rotate: number;
};

export type MemoryCluster<T> = {
  date: string;
  /** Cluster center in world coordinates. */
  x: number;
  y: number;
  /** Bounding radius used for packing (clusters never overlap). */
  r: number;
  tint: MemoryTint;
  sticker: { x: number; y: number; rotate: number };
  photos: PlacedPhoto<T>[];
};

const TINTS: MemoryTint[] = ["white", "aqua"];

/** Max visual photo card height (a 3:4 portrait at the widest width, with frame). */
const MAX_CARD_W = 184;
const RING_GAP = 150;
const FIRST_RING = 128;
const CLUSTER_GAP = 110;

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: tiny seeded PRNG in [0, 1). */
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many cards fit on ring `i` (0-based) without crowding. */
function ringCapacity(i: number) {
  const radius = FIRST_RING + i * RING_GAP;
  return Math.max(4, Math.floor((2 * Math.PI * radius) / 152));
}

function arrangeCluster<T extends { id: string }>(date: string, photos: T[]) {
  const rand = rng(hash(date));
  const placed: PlacedPhoto<T>[] = [];
  const width = (p: T) => 140 + (hash(p.id) % 40); // 140–179px, a little variety

  if (photos.length === 1) {
    const [p] = photos;
    placed.push({ photo: p, x: 0, y: -22, width: width(p) + 14, rotate: (rand() - 0.5) * 8 });
    return {
      placed,
      r: 168,
      sticker: { x: (rand() - 0.5) * 40, y: 132, rotate: (rand() - 0.5) * 10 },
    };
  }

  let ring = 0;
  let index = 0;
  let outer = FIRST_RING;
  while (index < photos.length) {
    const capacity = ringCapacity(ring);
    const onRing = Math.min(capacity, photos.length - index);
    const radius = FIRST_RING + ring * RING_GAP;
    const start = rand() * Math.PI * 2;
    for (let k = 0; k < onRing; k++) {
      const p = photos[index + k];
      const angle = start + (k / onRing) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const jitter = (rand() - 0.5) * 22;
      placed.push({
        photo: p,
        x: Math.cos(angle) * (radius + jitter),
        y: Math.sin(angle) * (radius + jitter),
        width: width(p),
        rotate: (rand() - 0.5) * 14,
      });
    }
    outer = radius;
    index += onRing;
    ring++;
  }

  return {
    placed,
    r: outer + MAX_CARD_W * 0.66,
    sticker: { x: 0, y: 0, rotate: (rand() - 0.5) * 10 },
  };
}

export function layoutMemories<T extends { id: string; date: string }>(photos: T[]): MemoryCluster<T>[] {
  const byDate = new Map<string, T[]>();
  for (const p of photos) {
    const list = byDate.get(p.date);
    if (list) list.push(p);
    else byDate.set(p.date, [p]);
  }
  const dates = [...byDate.keys()].sort().reverse(); // newest first → center

  const clusters: MemoryCluster<T>[] = [];
  // Archimedean spiral r = a·t; one loop apart ≈ one typical cluster diameter.
  const a = 520 / (2 * Math.PI);
  let lastT = 0;

  for (const date of dates) {
    const { placed, r, sticker } = arrangeCluster(date, byDate.get(date)!);
    const tint = TINTS[hash(`${date}#tint`) % TINTS.length];

    let x = 0;
    let y = 0;
    if (clusters.length > 0) {
      // Walk the spiral (from a bit behind the last placement, to fill gaps)
      // until this cluster's circle clears every placed one.
      let t = Math.max(0, lastT - Math.PI * 2);
      for (;;) {
        x = a * t * Math.cos(t);
        y = a * t * Math.sin(t);
        const fits = clusters.every((c) => Math.hypot(c.x - x, c.y - y) >= c.r + r + CLUSTER_GAP);
        if (fits) break;
        t += 24 / Math.max(a * t, 24); // ~24px of arc per step
      }
      lastT = t;
    }

    // Whole pixels / centidegrees: keeps server and client markup byte-identical
    // (long floats serialize differently and trip hydration checks).
    const px = Math.round;
    const deg = (d: number) => Math.round(d * 100) / 100;
    clusters.push({
      date,
      x: px(x),
      y: px(y),
      r: Math.ceil(r),
      tint,
      sticker: { x: px(sticker.x), y: px(sticker.y), rotate: deg(sticker.rotate) },
      photos: placed.map((p) => ({ ...p, x: px(p.x), y: px(p.y), rotate: deg(p.rotate) })),
    });
  }

  return clusters;
}

/** World-space bounding box of all clusters (for the minimap/zoom-to-fit). */
export function memoriesBounds(clusters: MemoryCluster<unknown>[]) {
  if (clusters.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return {
    minX: Math.min(...clusters.map((c) => c.x - c.r)),
    minY: Math.min(...clusters.map((c) => c.y - c.r)),
    maxX: Math.max(...clusters.map((c) => c.x + c.r)),
    maxY: Math.max(...clusters.map((c) => c.y + c.r)),
  };
}
