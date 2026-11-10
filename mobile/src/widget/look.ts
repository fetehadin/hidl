/**
 * The widget's "chunky" colors. Light: a teal widget with a white card on a darker teal edge.
 * Dark: near-black green with a clearly lighter card. Text pairs are chosen for contrast
 * (dark teal on the teal background and on white; mint-white on the dark card).
 */
export const LOOKS = {
  light: {
    bg: '#4DB6AC',
    card: '#FFFFFF',
    edge: '#B5D9D4',
    text: '#17403D',
    muted: '#4A6B68',
    onBg: '#17403D',
    chip: '#E3F4F1',
    bubble: '#EAF7F5',
    track: '#E1EFEC',
    dot: '#17403D',
    dotOff: '#2A7A72',
    button: '#FFFFFF',
    buttonEdge: '#2E8D84',
    ring: '#A9CBC6',
  },
  dark: {
    bg: '#0E1D1C',
    card: '#1E3B39',
    edge: '#0F2423',
    text: '#EAFBF8',
    muted: '#A6CBC6',
    onBg: '#EAFBF8',
    chip: '#2A4F4C',
    bubble: '#2A4F4C',
    track: '#13302E',
    dot: '#EAFBF8',
    dotOff: '#3E615E',
    button: '#1E3B39',
    buttonEdge: '#081312',
    ring: '#557A76',
  },
} as const;

export type LookName = keyof typeof LOOKS;
export type Look = (typeof LOOKS)[LookName];

/** Fonts bundled with the app (mobile/assets/fonts, listed in app.json): the file names. */
export const FONT = { round: 'Nunito-ExtraBold', roundHeavy: 'Nunito-Black', mono: 'JetBrainsMono-Bold' } as const;
