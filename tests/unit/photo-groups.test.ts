import { describe, expect, it } from "vitest";
import { PHOTO_GROUP_NAME_MAX, cleanGroupName, dropIndex, groupNameProblem, moveInOrder, moveToIndex } from "@/lib/photo-groups";

describe("photo group names", () => {
  it("tidies spaces", () => {
    expect(cleanGroupName("  Road   trips \n")).toBe("Road trips");
  });

  it("needs a name of a sensible length", () => {
    expect(groupNameProblem("")).toMatch(/name/);
    expect(groupNameProblem("x".repeat(PHOTO_GROUP_NAME_MAX))).toBeNull();
    expect(groupNameProblem("x".repeat(PHOTO_GROUP_NAME_MAX + 1))).toMatch(/under/);
  });

  it("refuses a second group with the same name, ignoring case, but not renaming itself", () => {
    const groups = [{ id: "1", name: "Family" }];
    expect(groupNameProblem("family", groups)).toMatch(/already/);
    expect(groupNameProblem("FAMILY", groups, "1")).toBeNull();
  });

  it("allows any language and emoji", () => {
    expect(groupNameProblem("ቤተሰብ 🏡")).toBeNull();
  });
});

describe("moveInOrder", () => {
  it("swaps with the neighbour, and does nothing past the ends", () => {
    expect(moveInOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveInOrder(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveInOrder(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });
});

describe("moveToIndex", () => {
  it("lifts one item out and drops it at the new place", () => {
    expect(moveToIndex(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveToIndex(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveToIndex(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
    expect(moveToIndex(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
  });
});

describe("dropIndex", () => {
  // Three 50px rows: middles at 25, 75, 125.
  const middles = [25, 75, 125];
  it("stays put until the dragged row passes a neighbour's middle", () => {
    expect(dropIndex(middles, 0, 25)).toBe(0);
    expect(dropIndex(middles, 0, 74)).toBe(0);
    expect(dropIndex(middles, 0, 76)).toBe(1);
    expect(dropIndex(middles, 0, 200)).toBe(2);
  });
  it("moves up past rows above it", () => {
    expect(dropIndex(middles, 2, 125)).toBe(2);
    expect(dropIndex(middles, 2, 70)).toBe(1);
    expect(dropIndex(middles, 2, -10)).toBe(0);
  });
});
