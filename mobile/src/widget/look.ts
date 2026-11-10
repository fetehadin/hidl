/**
 * The widget's "chunky" colors, in hidl's own teal (src/app/globals.css). Light: a teal frame with
 * white "hidl", glassy arrow buttons and a white card on a darker teal edge. Dark: near-black
 * green with a clearly lighter card. Text pairs are chosen for contrast on their own surface.
 */
export const LOOKS = {
  light: {
    bg: '#4DB6AC',
    card: '#FFFFFF',
    edge: '#BFDCD7',
    /** Titles, numbers, the bubble's words. */
    text: '#123F44',
    muted: '#5E6F72',
    /** "hidl", the arrows and the page dots on the teal frame. */
    onBg: '#FFFFFF',
    onBgSoft: 'rgba(255, 255, 255, 0.85)',
    chip: '#E2F0EE',
    bubble: '#E2F0EE',
    /** The progress bar: hidl's button teal on a pale track. */
    fill: '#2E7C7F',
    track: '#E2EEEC',
    /** Page dots on the frame (medium) and inside the card (small). */
    dot: '#FFFFFF',
    dotOff: 'rgba(255, 255, 255, 0.55)',
    cardDot: '#2E7C7F',
    cardDotOff: '#D4E4E1',
    button: 'rgba(255, 255, 255, 0.16)',
    buttonLine: 'rgba(255, 255, 255, 0.5)',
    icon: '#3A9295',
    /** The countdown on show in the large widget's list. */
    rowOn: '#E2F0EE',
  },
  dark: {
    bg: '#0E1D1C',
    card: '#1E3B39',
    edge: '#0A1615',
    text: '#EAFBF8',
    muted: '#A6CBC6',
    onBg: '#EAFBF8',
    onBgSoft: 'rgba(234, 251, 248, 0.75)',
    chip: '#2A4F4C',
    bubble: '#2A4F4C',
    fill: '#5CBDB6',
    track: '#13302E',
    dot: '#EAFBF8',
    dotOff: 'rgba(234, 251, 248, 0.35)',
    cardDot: '#5CBDB6',
    cardDotOff: '#3E615E',
    button: 'rgba(255, 255, 255, 0.06)',
    buttonLine: 'rgba(255, 255, 255, 0.28)',
    icon: '#5CBDB6',
    rowOn: '#2A4F4C',
  },
} as const;

export type LookName = keyof typeof LOOKS;
export type Look = (typeof LOOKS)[LookName];

/** Fonts bundled with the app (mobile/assets/fonts, listed in app.json): the file names. */
export const FONT = { round: 'Nunito-ExtraBold', roundHeavy: 'Nunito-Black', mono: 'JetBrainsMono-Bold' } as const;
