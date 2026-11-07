// The two looks: Teal Paper (light, the default) and Graphite (dark). Both keep the brand teal.
// Chosen per device and kept in a cookie, so the server renders the right one from the first
// byte (no flash). The tokens live in src/app/globals.css under :root / :root[data-theme="graphite"];
// the phone app's own screens copy them in mobile/src/theme.ts.

export const THEMES = ["teal", "graphite"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "teal";
export const THEME_COOKIE = "hidl-theme";

export const THEME_INFO: Record<Theme, { label: string; color: string; scheme: "light" | "dark"; swatches: string[] }> = {
  teal: { label: "Teal Paper", color: "#f5f3ee", scheme: "light", swatches: ["#f5f3ee", "#ffffff", "#e2f0ee", "#3a9295", "#105f68"] },
  graphite: { label: "Graphite", color: "#121516", scheme: "dark", swatches: ["#121516", "#1c2123", "#1d3434", "#5cbdb6", "#e8eded"] },
};

/** "blue" was the old second theme; people who picked it get Graphite. */
export function parseTheme(value: unknown): Theme {
  return value === "graphite" || value === "blue" ? "graphite" : DEFAULT_THEME;
}
