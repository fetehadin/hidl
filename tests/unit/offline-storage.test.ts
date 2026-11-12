import { describe, expect, it } from "vitest";
import { DEFAULT_STORAGE, KEEP_OPTIONS, LIMIT_OPTIONS, formatBytes } from "@/lib/offline-storage";

describe("offline storage", () => {
  it("formats sizes for the storage card", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(512 * 1024)).toBe("512 KB");
    expect(formatBytes(3.25 * 1024 * 1024)).toBe("3.3 MB");
    expect(formatBytes(86 * 1024 * 1024)).toBe("86 MB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
  });

  it("defaults are among the choices offered", () => {
    expect(KEEP_OPTIONS.some((o) => o.value === DEFAULT_STORAGE.keepDays)).toBe(true);
    expect(LIMIT_OPTIONS.some((o) => o.value === DEFAULT_STORAGE.maxMB)).toBe(true);
    expect(DEFAULT_STORAGE.fullOnMobile).toBe(false);
  });
});

describe("service worker mirror", () => {
  it("public/sw.js uses the same cache names and defaults", async () => {
    const { readFileSync } = await import("node:fs");
    const sw = readFileSync("public/sw.js", "utf8");
    expect(sw).toMatch(/const PHOTO_CACHE = "hidl-photos-v\d+";/);
    expect(sw).toMatch(/const PAGE_CACHE = "hidl-pages-v\d+";/);
    expect(sw).toContain('const SETTINGS_CACHE = "hidl-settings-v1";');
    expect(sw).toContain('const SETTINGS_KEY = "/__hidl/storage-settings";');
    const defaults = /const DEFAULTS = (\{[^}]*\});/.exec(sw)?.[1];
    expect(defaults && JSON.parse(defaults.replace(/(\w+):/g, '"$1":'))).toEqual(DEFAULT_STORAGE);
  });
});
