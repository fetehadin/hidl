import { describe, expect, it } from "vitest";
import { AVATAR_THEMES } from "@/lib/avatar";
import { DEFAULT_THEME, THEME_INFO, parseTheme } from "@/lib/theme";

describe("themes", () => {
  it("anything but graphite (or the old 'blue') is the default Teal Paper", () => {
    expect(parseTheme("graphite")).toBe("graphite");
    expect(parseTheme("blue")).toBe("graphite");
    expect(parseTheme("teal")).toBe("teal");
    expect(parseTheme(undefined)).toBe(DEFAULT_THEME);
    expect(parseTheme("dark")).toBe("teal");
  });
  it("graphite is dark and Teal Paper is light, so the browser draws controls to match", () => {
    expect(THEME_INFO.graphite.scheme).toBe("dark");
    expect(THEME_INFO.teal.scheme).toBe("light");
    expect(THEME_INFO.graphite.color).toBe("#121516");
  });
  it("Hidi's buddy colors follow the theme; the others are fixed", () => {
    expect(Object.values(AVATAR_THEMES.mint).filter((v) => v.startsWith("#"))).toEqual([]);
    expect(AVATAR_THEMES.berry.mid).toMatch(/^#/);
  });
});
