import { describe, expect, it } from "vitest";
import { addDays, photoStreak } from "@/lib/calendar";
import { layoutMemories } from "@/lib/memories";

function photos(spec: Record<string, number>) {
  return Object.entries(spec).flatMap(([date, n]) =>
    Array.from({ length: n }, (_, i) => ({ id: `${date}-${i}`, date })),
  );
}

describe("layoutMemories", () => {
  it("puts every photo of a day into exactly one cluster", () => {
    const input = photos({ "2026-10-01": 3, "2026-10-02": 1, "2026-10-05": 7 });
    const clusters = layoutMemories(input);
    expect(clusters.map((c) => c.date).sort()).toEqual(["2026-10-01", "2026-10-02", "2026-10-05"]);
    for (const c of clusters) {
      expect(c.photos.every((p) => p.photo.date === c.date)).toBe(true);
    }
    expect(clusters.flatMap((c) => c.photos.map((p) => p.photo.id)).sort()).toEqual(input.map((p) => p.id).sort());
  });

  it("centers the most recent day", () => {
    const [first] = layoutMemories(photos({ "2026-09-01": 2, "2026-10-30": 2, "2026-10-01": 1 }));
    expect(first.date).toBe("2026-10-30");
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
