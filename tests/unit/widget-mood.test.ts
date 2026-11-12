import { describe as group, expect, it } from "vitest";
import { describe, orderCountdowns, PICK_MS, smartOrder } from "../../mobile/src/widget/mood";
import { pathFromLink, widgetIdFromLink } from "../../mobile/src/deep-link";

// The phone widget's wording and Hidi's mood (mobile/src/widget/mood.ts).
const TZ = "Africa/Addis_Ababa";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// 2026-11-10 09:00 in Addis (06:00 UTC).
const now = Date.parse("2026-11-10T06:00:00Z");
const at = (ms: number) => new Date(now + ms).toISOString();
const item = (targetAt: string, extra: Partial<Parameters<typeof describe>[0]> = {}) => ({
  id: "a",
  kind: "exam",
  title: "Biology final",
  targetAt,
  units: ["days" as const, "hours" as const],
  ...extra,
});

group("widget mood", () => {
  it("is calm a week or more out, with the units chosen", () => {
    const s = describe(item(at(30 * DAY + 5 * HOUR)), now, TZ);
    expect(s.mood).toBe("calm");
    expect(s.big).toBe("30");
    expect(s.chips).toEqual(["days", "5h"]);
    expect(s.short).toBe("30d 5h");
  });

  it("is excited under 7 days", () => {
    const s = describe(item(at(5 * DAY + 21 * HOUR)), now, TZ);
    expect(s.mood).toBe("excited");
    expect(s.big).toBe("5");
    expect(s.chips).toEqual(["days", "21h"]);
  });

  it("is nervous under 24 hours when the day is tomorrow", () => {
    // 20 hours on: 05:00 tomorrow in Addis.
    const s = describe(item(at(20 * HOUR)), now, TZ);
    expect(s.mood).toBe("nervous");
    expect(s.big).toBe("20");
    expect(s.chips).toEqual(["hours"]);
  });

  it("parties on the day itself, before and after the time", () => {
    const later = describe(item(at(6 * HOUR)), now, TZ);
    expect(later.mood).toBe("party");
    expect(later.bigIsWord).toBe(true);
    expect(later.chips).toEqual(["in 6h"]);
    const passed = describe(item(at(-2 * HOUR)), now, TZ);
    expect(passed.mood).toBe("party");
    expect(passed.big).toBe("It’s here!");
  });

  it("is sleepy after, counting up the days", () => {
    const s = describe(item(at(-2 * DAY)), now, TZ);
    expect(s.mood).toBe("sleepy");
    expect(s.big).toBe("+2");
    expect(s.chips).toEqual(["days ago"]);
    expect(s.progress).toBe(1);
  });

  it("fills the bar from when it was made", () => {
    const s = describe(item(at(10 * DAY), { createdAt: at(-10 * DAY) }), now, TZ);
    expect(s.progress).toBeCloseTo(0.5);
    expect(describe(item(at(10 * DAY)), now, TZ).progress).toBeNull();
  });

  it("keeps the same line all day", () => {
    const a = describe(item(at(30 * DAY)), now, TZ).line;
    expect(describe(item(at(30 * DAY - HOUR)), now + HOUR, TZ).line).toBe(a);
  });

  it("orders soonest first, today next to them, then the ones that passed", () => {
    const list = [
      item(at(-3 * DAY), { id: "old" }),
      item(at(9 * DAY), { id: "later" }),
      item(at(-1 * HOUR), { id: "today" }),
      item(at(2 * DAY), { id: "soon" }),
      item(at(-1 * DAY), { id: "yesterday" }),
    ];
    expect(orderCountdowns(list, now, TZ).map((i) => i.id)).toEqual(["today", "soon", "later", "yesterday", "old"]);
  });
});

group("widget links", () => {
  it("opens paths on the site only", () => {
    expect(pathFromLink("hidl://open?path=%2Fcountdown%23c-abc")).toBe("/countdown#c-abc");
    expect(pathFromLink("hidl://open?path=%2F%2Fevil.com")).toBeNull();
    expect(pathFromLink("hidl://open?path=https%3A%2F%2Fevil.com")).toBeNull();
    expect(pathFromLink("hidl://auth?sealed=x")).toBeNull();
    expect(pathFromLink(null)).toBeNull();
  });
});

group("widget settings link", () => {
  it("reads the widget id from the sliders button's link", () => {
    expect(widgetIdFromLink("hidl://widget?id=42")).toBe(42);
    expect(widgetIdFromLink("hidl://widget")).toBeNull();
  });

  it("ignores anything else", () => {
    expect(widgetIdFromLink("hidl://open?path=/countdown")).toBeUndefined();
    expect(widgetIdFromLink("hidl://widget?id=abc")).toBeUndefined();
    expect(widgetIdFromLink("https://example.com/widget?id=1")).toBeUndefined();
    expect(widgetIdFromLink(null)).toBeUndefined();
  });
});

group("widget stack order", () => {
  const list = (...days: number[]) => days.map((d, i) => item(at(d * DAY), { id: `c${i}`, title: `T${i}` }));
  const ids = (r: { items: { id?: string }[] }) => r.items.map((i) => i.id);

  it("puts the soonest on top, the rest soonest-first after it", () => {
    const r = smartOrder(list(20, 5, 10), now, TZ);
    expect(ids(r)).toEqual(["c1", "c2", "c0"]);
    expect(r.positions).toEqual([0, 1, 2]);
  });

  it("keeps a card flipped to (on older APKs) on top for a while, then goes back to the soonest", () => {
    const items = list(2, 9, 30);
    const picked = smartOrder(items, now, TZ, { id: "c1", at: now - 60_000 });
    expect(ids(picked)).toEqual(["c1", "c2", "c0"]);
    expect(picked.positions).toEqual([1, 2, 0]);
    expect(ids(smartOrder(items, now, TZ, { id: "c1", at: now - 2 * PICK_MS }))).toEqual(["c0", "c1", "c2"]);
  });

  it("ignores a pick that's no longer on the widget, and leaves one or none alone", () => {
    expect(ids(smartOrder(list(4, 8), now, TZ, { id: "gone", at: now }))).toEqual(["c0", "c1"]);
    expect(ids(smartOrder(list(3), now, TZ))).toEqual(["c0"]);
    expect(smartOrder([], now, TZ).items).toEqual([]);
  });
});
