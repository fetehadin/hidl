import type { Mood } from './mood';

type Color = `#${string}` | `rgba(${number}, ${number}, ${number}, ${number})`;

/**
 * The widget's colors: every countdown is its own card in Hidl's deep teal (light) or graphite
 * teal (dark), with white type, white "glass" for buttons and tracks, and Hidi on top. Small text
 * sits on the darker half of each gradient, so it stays readable (white on #17636A is 6.5:1).
 */
export const LOOKS = {
  light: {
    from: '#3FA29E',
    to: '#17636A',
    text: '#FFFFFF',
    soft: 'rgba(255, 255, 255, 0.82)',
    faint: 'rgba(255, 255, 255, 0.6)',
    glass: 'rgba(255, 255, 255, 0.16)',
    glassLine: 'rgba(255, 255, 255, 0.34)',
    track: 'rgba(255, 255, 255, 0.24)',
    fill: '#FFFFFF',
    dot: '#FFFFFF',
    dotOff: 'rgba(255, 255, 255, 0.38)',
    /** Hidi's speech bubble: white with Hidi's ink. */
    bubble: '#FFFFFF',
    bubbleText: '#0F3F45',
    /** A row in the large widget's list. */
    row: 'rgba(255, 255, 255, 0.13)',
  },
  dark: {
    from: '#1F3F3D',
    to: '#0B1817',
    text: '#EAFBF8',
    soft: 'rgba(234, 251, 248, 0.8)',
    faint: 'rgba(234, 251, 248, 0.55)',
    glass: 'rgba(255, 255, 255, 0.07)',
    glassLine: 'rgba(255, 255, 255, 0.2)',
    track: 'rgba(255, 255, 255, 0.12)',
    fill: '#5CBDB6',
    dot: '#5CBDB6',
    dotOff: 'rgba(255, 255, 255, 0.22)',
    bubble: '#2A4F4C',
    bubbleText: '#EAFBF8',
    row: 'rgba(255, 255, 255, 0.06)',
  },
} as const satisfies Record<string, Record<string, Color>>;

export type LookName = keyof typeof LOOKS;
export type Look = (typeof LOOKS)[LookName];

/**
 * Hidi's mood changes the whole card, like a Duolingo widget: gold on the day itself, a quiet slate
 * once it has passed. Otherwise the theme's teal. Same in both themes (they're occasions).
 */
const MOOD_SKIN: Partial<Record<Mood, { from: Color; to: Color }>> = {
  party: { from: '#F4B740', to: '#D9661A' },
  sleepy: { from: '#6E8587', to: '#3B4D4F' },
};

export function skinFor(look: Look, mood: Mood): { from: Color; to: Color } {
  return MOOD_SKIN[mood] ?? { from: look.from, to: look.to };
}

/** Fonts bundled with the app (mobile/assets/fonts, listed in app.json): the file names. */
export const FONT = { round: 'Nunito-ExtraBold', roundHeavy: 'Nunito-Black', mono: 'JetBrainsMono-Bold' } as const;
