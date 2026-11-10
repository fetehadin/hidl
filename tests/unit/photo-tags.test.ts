import { describe, expect, it } from "vitest";
import { MAX_PHOTO_TAGS, PHOTO_TAGS, PHOTO_TAG_INFO, cleanPhotoTags, togglePhotoTag } from "@/lib/photo-tags";

describe("photo kinds", () => {
  it("has a label and an emoji for every kind", () => {
    for (const tag of PHOTO_TAGS) {
      expect(PHOTO_TAG_INFO[tag].label).toBeTruthy();
      expect(PHOTO_TAG_INFO[tag].emoji).toBeTruthy();
    }
  });

  it("cleans a stored list: known kinds, once each, in the usual order", () => {
    expect(cleanPhotoTags(["food", "cars", "nature", "food", null])).toEqual(["nature", "food"]);
    expect(cleanPhotoTags(null)).toEqual([]);
  });

  it("toggles a kind on and off", () => {
    expect(togglePhotoTag([], "food")).toEqual(["food"]);
    expect(togglePhotoTag(["family", "food"], "food")).toEqual(["family"]);
    expect(togglePhotoTag(["food"], "nature")).toEqual(["nature", "food"]);
  });

  it("stops adding at the limit, but still removes", () => {
    const full = PHOTO_TAGS.slice(0, MAX_PHOTO_TAGS);
    const extra = PHOTO_TAGS[MAX_PHOTO_TAGS];
    expect(togglePhotoTag(full, extra)).toEqual(full);
    expect(togglePhotoTag(full, full[0])).toHaveLength(MAX_PHOTO_TAGS - 1);
  });
});
