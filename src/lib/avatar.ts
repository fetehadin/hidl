/**
 * A user's avatar: their own little Hidi-style buddy, built from a few choices. Stored as
 * `user_metadata.avatar` (like the calendar preference) and drawn by src/components/avatar.tsx.
 * No zod here, so client components (the builder, the nav) can import it.
 */

export const AVATAR_THEMES = {
  // Hidi's own colors, which follow the app theme (teal or blue; see --hidi-* in globals.css).
  // The key stays "mint": it's what saved buddies and avatar_ok() use.
  mint: { label: "Hidi", light: "var(--hidi-light)", mid: "var(--hidi-mid)", dark: "var(--hidi-dark)", limb: "var(--hidi-limb)", foot: "var(--hidi-foot)", shade: "var(--hidi-shade)", bg: "var(--hidi-bg)", pattern: "var(--hidi-pattern)" },
  sunset: { label: "Sunset", light: "#fff6ee", mid: "#ffc49b", dark: "#f59a6b", limb: "#f8ad84", foot: "#e07d50", shade: "#c8643b", bg: "#ffeedf", pattern: "#ffd2b0" },
  berry: { label: "Berry", light: "#fff2f6", mid: "#f6b0c6", dark: "#e57c9f", limb: "#ee96b3", foot: "#cf6389", shade: "#b44d72", bg: "#fde6ee", pattern: "#f6c4d5" },
  ocean: { label: "Ocean", light: "#eef6ff", mid: "#a6cbf2", dark: "#6fa3df", limb: "#89b6e8", foot: "#4f86c7", shade: "#3c6fae", bg: "#e2eefc", pattern: "#bcd6f5" },
  lemon: { label: "Lemon", light: "#fffbea", mid: "#fbe18c", dark: "#f0c445", limb: "#f5d261", foot: "#d9a925", shade: "#b88b12", bg: "#fff6d3", pattern: "#f8e49c" },
  lavender: { label: "Lavender", light: "#f7f2ff", mid: "#cdb8f2", dark: "#a585df", limb: "#b89ce8", foot: "#8a68c9", shade: "#7253b0", bg: "#efe7fd", pattern: "#d7c7f6" },
  cocoa: { label: "Cocoa", light: "#fbf3ec", mid: "#d7b394", dark: "#b0835f", limb: "#c39a77", foot: "#94684a", shade: "#7a5338", bg: "#f4e8de", pattern: "#dfc6b0" },
  cloud: { label: "Cloud", light: "#ffffff", mid: "#e4e9ec", dark: "#b9c4cb", limb: "#ccd5da", foot: "#9aa8b1", shade: "#7d8c96", bg: "#eef2f4", pattern: "#d5dde2" },
} as const;

export const AVATAR_PARTS = {
  theme: Object.keys(AVATAR_THEMES) as (keyof typeof AVATAR_THEMES)[],
  eyes: ["round", "happy", "sleepy", "star", "wink", "big"],
  mouth: ["smile", "grin", "o", "tongue", "cat", "flat"],
  top: ["sprout", "bunny", "cat", "horns", "antenna", "none"],
  extra: ["none", "glasses", "bow", "cap", "headphones", "flower"],
  bg: ["plain", "dots", "stars", "waves", "hearts"],
} as const;

export type AvatarPart = keyof typeof AVATAR_PARTS;
export type AvatarConfig = { [K in AvatarPart]: (typeof AVATAR_PARTS)[K][number] };

export const PART_LABELS: Record<AvatarPart, string> = {
  theme: "Color",
  eyes: "Eyes",
  mouth: "Mouth",
  top: "Top",
  extra: "Extra",
  bg: "Background",
};

export const OPTION_LABELS: Record<string, string> = {
  round: "Round", happy: "Happy", sleepy: "Sleepy", star: "Starry", wink: "Wink", big: "Sparkly",
  smile: "Smile", grin: "Grin", o: "Surprised", tongue: "Cheeky", cat: "Kitty", flat: "Chill",
  sprout: "Sprout", bunny: "Bunny ears", horns: "Horns", antenna: "Antenna", none: "None",
  glasses: "Glasses", bow: "Bow", cap: "Grad cap", headphones: "Headphones", flower: "Flower",
  plain: "Plain", dots: "Dots", stars: "Stars", waves: "Waves", hearts: "Hearts",
  ...Object.fromEntries(Object.entries(AVATAR_THEMES).map(([k, v]) => [k, v.label])),
};
// "cat" is both a mouth and a top; the builder labels them by part.
export function optionLabel(part: AvatarPart, value: string) {
  if (part === "top" && value === "cat") return "Cat ears";
  return OPTION_LABELS[value] ?? value;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  theme: "mint",
  eyes: "round",
  mouth: "smile",
  top: "sprout",
  extra: "none",
  bg: "plain",
};

/** Whatever is stored (or nothing), as a valid avatar: unknown values fall back to the default. */
export function parseAvatar(raw: unknown): AvatarConfig {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_AVATAR } as Record<AvatarPart, string>;
  for (const part of Object.keys(AVATAR_PARTS) as AvatarPart[]) {
    const v = obj[part];
    if (typeof v === "string" && (AVATAR_PARTS[part] as readonly string[]).includes(v)) out[part] = v;
  }
  return out as AvatarConfig;
}

export function isValidAvatar(raw: unknown): raw is AvatarConfig {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  return (Object.keys(AVATAR_PARTS) as AvatarPart[]).every(
    (p) => typeof obj[p] === "string" && (AVATAR_PARTS[p] as readonly string[]).includes(obj[p] as string),
  );
}

export function randomAvatar(rand: () => number = Math.random): AvatarConfig {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  return {
    theme: pick(AVATAR_PARTS.theme),
    eyes: pick(AVATAR_PARTS.eyes),
    mouth: pick(AVATAR_PARTS.mouth),
    top: pick(AVATAR_PARTS.top),
    extra: pick(AVATAR_PARTS.extra),
    bg: pick(AVATAR_PARTS.bg),
  };
}
