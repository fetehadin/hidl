import { describe, expect, it } from "vitest";
import { AVATAR_THEMES } from "@/lib/avatar";
import { DEFAULT_THEME, THEME_INFO, parseTheme } from "@/lib/theme";

describe("themes", () => {
  it("anything but 'blue' is the default teal", () => {
    expect(parseTheme("blue")).toBe("blue");
    expect(parseTheme("teal")).toBe("teal");
    expect(parseTheme(undefined)).toBe(DEFAULT_THEME);
    expect(parseTheme("dark")).toBe("teal");
  });
  it("the blue theme uses exactly the given palette", () => {
    expect(THEME_INFO.blue.swatches).toEqual(["#ffffff", "#a7ebf2", "#54acbf", "#26658c", "#011c40"]);
  });
  it("Hidi's buddy colors follow the theme; the others are fixed", () => {
    expect(Object.values(AVATAR_THEMES.mint).filter((v) => v.startsWith("#"))).toEqual([]);
    expect(AVATAR_THEMES.berry.mid).toMatch(/^#/);
  });
});
