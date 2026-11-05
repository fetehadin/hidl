// The two looks: the original bright teal, and the bright modern blue. Both are light only.
// Chosen per device and kept in a cookie, so the server renders the right one from the first
// byte (no flash). The tokens live in src/app/globals.css under :root / :root[data-theme="blue"].

export const THEMES = ["teal", "blue"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "teal";
export const THEME_COOKIE = "hidl-theme";

export const THEME_INFO: Record<Theme, { label: string; description: string; color: string; swatches: string[] }> = {
  teal: { label: "Teal", description: "Soft, rounded and playful.", color: "#c8e6e2", swatches: ["#ffffff", "#c8e6e2", "#63c1bb", "#3a9295", "#105f68"] },
  blue: { label: "Blue", description: "Bright, clean and focused.", color: "#ffffff", swatches: ["#ffffff", "#a7ebf2", "#54acbf", "#26658c", "#011c40"] },
};

export function parseTheme(value: unknown): Theme {
  return value === "blue" ? "blue" : DEFAULT_THEME;
}
