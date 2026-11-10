/**
 * Layout for the memories board: photos are gathered into "islands" (one per day, or one per
 * kind of photo: nature, food, family...), and islands are packed outward along a spiral with the
 * first group (the most recent day, or the biggest kind) at the center (world origin). Pure and
 * deterministic (seeded by the group key and photo ids), so the board looks the same on every
 * visit and on the server.
 */
import { PHOTO_TAGS, type PhotoTag } from "@/lib/photo-tags";

/** How the board gathers photos into islands. */
export type MemoryGroupBy = "day" | "kind";

/** The kind-island for photos nobody has sorted yet. */
export const UNSORTED = "unsorted";
export type MemoryKind = PhotoTag | typeof UNSORTED;

export type PlacedPhoto<T> = {
  photo: T;
  /** Center of the photo card, relative to its cluster's center. */
  x: number;
  y: number;
  width: number;
  rotate: number;
};

export type MemoryCluster<T> = {
  /** The day ("YYYY-MM-DD") or the kind (a PhotoTag, or UNSORTED). */
  key: string;
  /** Cluster center in world coordinates. */
  x: number;
  y: number;
  /** Bounding radius used for packing (clusters never overlap). */
  r: number;
  sticker: { x: number; y: number; rotate: number };
  photos: PlacedPhoto<T>[];
};

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

function arrangeCluster<T extends { id: string }>(key: string, photos: T[]) {
  const rand = rng(hash(key));
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

type Groupable = { id: string; date: string; tags?: readonly string[] };

/**
 * The islands, in the order they're placed (the first goes in the middle).
 * By day: newest day first, photos in upload order. By kind: the biggest kind first and the
 * unsorted ones last, newest photos first. A photo with two kinds is on both islands.
 */
export function groupMemories<T extends Groupable>(photos: T[], by: MemoryGroupBy): { key: string; photos: T[] }[] {
  const groups = new Map<string, T[]>();
  const add = (key: string, p: T) => {
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  };

  if (by === "day") {
    for (const p of photos) add(p.date, p);
    return [...groups.keys()].sort().reverse().map((key) => ({ key, photos: groups.get(key)! }));
  }

  // Newest first: input is oldest → newest (date, then upload order), so flip both.
  const newest = photos.map((p, i) => ({ p, i })).sort((a, b) => (a.p.date === b.p.date ? b.i - a.i : a.p.date < b.p.date ? 1 : -1));
  for (const { p } of newest) {
    const kinds = PHOTO_TAGS.filter((t) => p.tags?.includes(t));
    if (kinds.length === 0) add(UNSORTED, p);
    for (const k of kinds) add(k, p);
  }
  const order = (key: string) => (key === UNSORTED ? PHOTO_TAGS.length : PHOTO_TAGS.indexOf(key as PhotoTag));
  return [...groups.entries()]
    .sort(([a, pa], [b, pb]) => {
      if (a === UNSORTED || b === UNSORTED) return order(a) - order(b);
      return pb.length - pa.length || order(a) - order(b);
    })
    .map(([key, list]) => ({ key, photos: list }));
}

export function layoutMemories<T extends Groupable>(photos: T[], by: MemoryGroupBy = "day"): MemoryCluster<T>[] {
  const groups = groupMemories(photos, by);

  const clusters: MemoryCluster<T>[] = [];
  // Archimedean spiral r = a·t; one loop apart ≈ one typical cluster diameter.
  const a = 520 / (2 * Math.PI);
  let lastT = 0;

  for (const group of groups) {
    const { placed, r, sticker } = arrangeCluster(group.key, group.photos);

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
      key: group.key,
      x: px(x),
      y: px(y),
      r: Math.ceil(r),
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

/**
 * Where the middle of the screen may go: inside the photos' bounding box and inside the circle
 * around the center that holds every island. The spiral makes the board roughly round, so the
 * box alone would leave its empty corners in reach, where no photo is in sight.
 */
export type BoardRegion = { minX: number; minY: number; maxX: number; maxY: number; radius: number };

export function boardRegion(clusters: MemoryCluster<unknown>[]): BoardRegion {
  return {
    ...memoriesBounds(clusters),
    radius: clusters.length === 0 ? 0 : Math.max(...clusters.map((c) => Math.hypot(c.x, c.y) + c.r)),
  };
}

/** The nearest point to (x, y) inside the region. */
export function clampToRegion(region: BoardRegion, x: number, y: number) {
  // The box holds the origin (the first island sits there) and is convex, so pulling a point in
  // the box toward the origin keeps it in the box.
  let cx = Math.min(region.maxX, Math.max(region.minX, x));
  let cy = Math.min(region.maxY, Math.max(region.minY, y));
  const d = Math.hypot(cx, cy);
  if (d > region.radius) {
    cx = (cx / d) * region.radius;
    cy = (cy / d) * region.radius;
  }
  return { x: cx, y: cy };
}
