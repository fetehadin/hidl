/**
 * The web app's two themes (src/app/globals.css), so the app's own screens and the widget look
 * exactly like hidl. Teal Paper is the default; the journal screen follows whichever theme the
 * website is showing (WebShell listens for it).
 */
export const palettes = {
  teal: {
    paper: '#f5f3ee',
    card: '#ffffff',
    line: '#e6e2da',
    lineStrong: '#d6d1c6',
    soft: '#e2f0ee',
    ink: '#17393d',
    muted: '#5e6f72',
    heading: '#105f68',
    teal: '#3a9295',
    fresh: '#63c1bb',
    button: '#2e7c7f',
    buttonInk: '#ffffff',
    danger: '#9c2f3d',
    statusBar: 'dark',
  },
  graphite: {
    paper: '#121516',
    card: '#1c2123',
    line: '#2a3133',
    lineStrong: '#3a4446',
    soft: '#1d3434',
    ink: '#e8eded',
    muted: '#8f9b9c',
    heading: '#f3f6f6',
    teal: '#5cbdb6',
    fresh: '#5cbdb6',
    button: '#5cbdb6',
    buttonInk: '#0e1415',
    danger: '#e07a86',
    statusBar: 'light',
  },
} as const;

export type ThemeName = keyof typeof palettes;

/** Where the app keeps the theme the page last showed (WebShell writes it, the widget reads it). */
export const THEME_KEY = 'hidl.theme';
export type Palette = (typeof palettes)[ThemeName];

/** Teal Paper: the sign-in screen and the widget. */
export const colors = palettes.teal;

/** Same rule as parseTheme in src/lib/theme.ts ("blue" was the old second theme). */
export function parseTheme(value: unknown): ThemeName {
  return value === 'graphite' || value === 'blue' ? 'graphite' : 'teal';
}
