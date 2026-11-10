import { describe, expect, it } from "vitest";
import { addDays, photoStreak } from "@/lib/calendar";
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

describe("grouping by kind", () => {
  const input = [
    { id: "a", date: "2026-10-01", tags: ["food"] },
    { id: "b", date: "2026-10-02", tags: ["family", "food"] },
    { id: "c", date: "2026-10-02", tags: [] },
    { id: "d", date: "2026-10-03", tags: ["nature"] },
    { id: "e", date: "2026-10-03", tags: ["food"] },
    { id: "f", date: "2026-10-04" },
  ];

  it("puts the biggest kind in the middle and the unsorted photos last", () => {
    const groups = groupMemories(input, "kind");
    expect(groups.map((g) => g.key)).toEqual(["food", "nature", "family", UNSORTED]);
  });

  it("puts a photo with two kinds on both islands, newest first", () => {
    const groups = new Map(groupMemories(input, "kind").map((g) => [g.key, g.photos.map((p) => p.id)]));
    expect(groups.get("food")).toEqual(["e", "b", "a"]);
    expect(groups.get("family")).toEqual(["b"]);
    expect(groups.get(UNSORTED)).toEqual(["f", "c"]);
  });

  it("lays kind islands out without overlap, the first at the center", () => {
    const clusters = layoutMemories(input, "kind");
    expect([clusters[0].key, clusters[0].x, clusters[0].y]).toEqual(["food", 0, 0]);
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const [a, b] = [clusters[i], clusters[j]];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
      }
    }
  });

  it("ignores kinds it doesn't know", () => {
    expect(groupMemories([{ id: "x", date: "2026-10-01", tags: ["cars"] }], "kind").map((g) => g.key)).toEqual([UNSORTED]);
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

describe("photoStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(photoStreak(["2026-10-29", "2026-10-30", "2026-10-31"], "2026-10-31")).toEqual({ count: 3, todayDone: true });
  });

  it("doesn't break the streak before today is captured", () => {
    expect(photoStreak(["2026-10-29", "2026-10-30"], "2026-10-31")).toEqual({ count: 2, todayDone: false });
  });

  it("resets after a missed day, across month boundaries", () => {
    expect(photoStreak(["2026-09-29", "2026-09-30", "2026-10-01"], "2026-10-03")).toEqual({ count: 0, todayDone: false });
    expect(photoStreak(["2026-09-30", "2026-10-01"], "2026-10-01")).toEqual({ count: 2, todayDone: true });
  });
});
