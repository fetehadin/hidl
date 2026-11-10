import { describe, expect, it } from "vitest";
import { FRAME_RATIO, bestColumns, laneLayout, pickForPicture } from "@/lib/lane-layout";

const phone = { x: 16, y: 120, w: 358, h: 640 };

/** The corners of a tilted frame centered on (x, y). */
function corners(s: { x: number; y: number; width: number; rotate: number }) {
  const h = s.width * FRAME_RATIO;
  const a = (s.rotate * Math.PI) / 180;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([dx, dy]) => {
    const px = (dx * s.width) / 2;
    const py = (dy * h) / 2;
    return { x: s.x + px * Math.cos(a) - py * Math.sin(a), y: s.y + px * Math.sin(a) + py * Math.cos(a) };
  });
}

describe("laneLayout", () => {
  it("gives nothing for no photos", () => {
    expect(laneLayout(0, phone)).toEqual([]);
  });

  it.each([1, 2, 3, 5, 7, 12, 31, 48])("keeps all %i frames whole inside the area", (n) => {
    const slots = laneLayout(n, phone);
    expect(slots).toHaveLength(n);
    for (const s of slots) {
      for (const c of corners(s)) {
        expect(c.x).toBeGreaterThanOrEqual(phone.x - 0.5);
        expect(c.x).toBeLessThanOrEqual(phone.x + phone.w + 0.5);
        expect(c.y).toBeGreaterThanOrEqual(phone.y - 0.5);
        expect(c.y).toBeLessThanOrEqual(phone.y + phone.h + 0.5);
      }
    }
  });

  it("never lets two frames' centers sit closer than a frame", () => {
    const slots = laneLayout(12, phone);
    for (let i = 0; i < slots.length; i++)
      for (let j = i + 1; j < slots.length; j++) {
        const dx = Math.abs(slots[i].x - slots[j].x);
        const dy = Math.abs(slots[i].y - slots[j].y);
        expect(dx >= slots[i].width * 0.95 || dy >= slots[i].width * FRAME_RATIO * 0.95).toBe(true);
      }
  });

  it("makes frames smaller as photos are added, but fills the picture", () => {
    const one = laneLayout(1, phone)[0].width;
    const four = laneLayout(4, phone)[0].width;
    const thirty = laneLayout(30, phone)[0].width;
    expect(one).toBeGreaterThan(four);
    expect(four).toBeGreaterThan(thirty);
    expect(thirty).toBeGreaterThan(50);
  });

  it("is the same every time for the same photos", () => {
    expect(laneLayout(9, phone)).toEqual(laneLayout(9, phone));
  });
});

describe("bestColumns", () => {
  it("uses more columns on a wide picture than a tall one", () => {
    expect(bestColumns(12, { w: 1600, h: 800 }).cols).toBeGreaterThan(bestColumns(12, { w: 400, h: 800 }).cols);
  });
});

describe("pickForPicture", () => {
  const p = (date: string, id: number) => ({ date, id });

  it("keeps everything when it fits", () => {
    const all = [p("2026-11-01", 1), p("2026-11-02", 2)];
    expect(pickForPicture(all, 5)).toBe(all);
  });

  it("keeps one photo of every day first, then fills up, in order", () => {
    const all = [p("2026-11-01", 1), p("2026-11-01", 2), p("2026-11-01", 3), p("2026-11-02", 4), p("2026-11-03", 5)];
    expect(pickForPicture(all, 4).map((x) => x.id)).toEqual([1, 2, 4, 5]);
  });
});
