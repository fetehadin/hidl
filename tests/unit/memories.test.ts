import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/calendar";
import { UNSORTED, boardRegion, clampToRegion, groupMemories, layoutMemories } from "@/lib/memories";

function photos(spec: Record<string, number>) {
  return Object.entries(spec).flatMap(([date, n]) =>
    Array.from({ length: n }, (_, i) => ({ id: `${date}-${i}`, date })),
  );
}

describe("layoutMemories", () => {
  it("puts every photo of a day into exactly one cluster", () => {
    const input = photos({ "2026-10-01": 3, "2026-10-02": 1, "2026-10-05": 7 });
    const clusters = layoutMemories(input);
    expect(clusters.map((c) => c.key).sort()).toEqual(["2026-10-01", "2026-10-02", "2026-10-05"]);
    for (const c of clusters) {
      expect(c.photos.every((p) => p.photo.date === c.key)).toBe(true);
    }
    expect(clusters.flatMap((c) => c.photos.map((p) => p.photo.id)).sort()).toEqual(input.map((p) => p.id).sort());
  });

  it("centers the most recent day", () => {
    const [first] = layoutMemories(photos({ "2026-09-01": 2, "2026-10-30": 2, "2026-10-01": 1 }));
    expect(first.key).toBe("2026-10-30");
    expect([first.x, first.y]).toEqual([0, 0]);
  });

  it("never overlaps two days, even with many uneven clusters", () => {
    const spec: Record<string, number> = {};
    for (let i = 0; i < 120; i++) spec[addDays("2026-01-01", i)] = 1 + ((i * 7) % 13);
    const clusters = layoutMemories(photos(spec));
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i];
        const b = clusters[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
      }
    }
  });

  it("keeps each photo inside its own cluster's radius", () => {
    const clusters = layoutMemories(photos({ "2026-10-01": 1, "2026-10-02": 4, "2026-10-03": 20 }));
    for (const c of clusters) {
      for (const p of c.photos) expect(Math.hypot(p.x, p.y) + p.width / 2).toBeLessThanOrEqual(c.r);
    }
  });

  it("is deterministic", () => {
    const input = photos({ "2026-10-01": 3, "2026-10-04": 5 });
    expect(layoutMemories(input)).toEqual(layoutMemories(input));
  });
});

describe("grouping by the person's own groups", () => {
  const input = [
    { id: "a", date: "2026-10-01", groups: ["g-food"] },
    { id: "b", date: "2026-10-02", groups: ["g-family", "g-food"] },
    { id: "c", date: "2026-10-02", groups: [] },
    { id: "d", date: "2026-10-03", groups: ["g-trips"] },
    { id: "e", date: "2026-10-03", groups: ["g-food", "g-deleted"] },
    { id: "f", date: "2026-10-04" },
  ];
  const order = ["g-trips", "g-empty", "g-food", "g-family"];

  it("follows the person's order, skips empty groups, and puts photos in no group last", () => {
    expect(groupMemories(input, "group", order).map((g) => g.key)).toEqual(["g-trips", "g-food", "g-family", UNSORTED]);
  });

  it("puts a photo in two groups on both islands, newest first", () => {
    const groups = new Map(groupMemories(input, "group", order).map((g) => [g.key, g.photos.map((p) => p.id)]));
    expect(groups.get("g-food")).toEqual(["e", "b", "a"]);
    expect(groups.get("g-family")).toEqual(["b"]);
    expect(groups.get(UNSORTED)).toEqual(["f", "c"]);
  });

  it("lays group islands out without overlap, the first group at the center", () => {
    const clusters = layoutMemories(input, "group", order);
    expect([clusters[0].key, clusters[0].x, clusters[0].y]).toEqual(["g-trips", 0, 0]);
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const [a, b] = [clusters[i], clusters[j]];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
      }
    }
  });

  it("treats groups it doesn't know (deleted ones) as no group", () => {
    expect(groupMemories([{ id: "x", date: "2026-10-01", groups: ["gone"] }], "group", order).map((g) => g.key)).toEqual([UNSORTED]);
  });
});

describe("board region", () => {
  const spec: Record<string, number> = {};
  for (let i = 0; i < 40; i++) spec[addDays("2026-01-01", i)] = 1 + (i % 5);
  const clusters = layoutMemories(photos(spec));
  const region = boardRegion(clusters);

  it("leaves points over the photos alone", () => {
    for (const c of clusters) expect(clampToRegion(region, c.x, c.y)).toEqual({ x: c.x, y: c.y });
  });

  it("keeps the middle of the screen within reach of a photo", () => {
    // Far off in every direction, including the corners the bounding box alone would allow.
    for (let a = 0; a < 16; a++) {
      const angle = (a / 16) * Math.PI * 2;
      const p = clampToRegion(region, Math.cos(angle) * 1e6, Math.sin(angle) * 1e6);
      const nearest = Math.min(...clusters.map((c) => Math.hypot(c.x - p.x, c.y - p.y) - c.r));
      expect(nearest).toBeLessThan(800);
      expect(p.x).toBeGreaterThanOrEqual(region.minX);
      expect(p.x).toBeLessThanOrEqual(region.maxX);
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(region.radius + 1e-6);
    }
  });
});

