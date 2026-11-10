import { describe, expect, it } from "vitest";
import { PHOTO_GROUP_NAME_MAX, cleanGroupName, groupNameProblem, moveInOrder } from "@/lib/photo-groups";

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
