import type { Mood } from './mood';

/**
 * Hidi, the mascot, as SVG strings for the home-screen widget (widgets can't run React Native
 * components, but SvgWidget draws an SVG string). Same body, shapes and colors as the website's
 * src/components/mascot.tsx; the face, arms and extras change with the mood:
 *
 *   calm     eyes open, a soft smile           excited  arms up, open smile, sparkles
 *   nervous  wide eyes, wobbly mouth, sweat    party    party hat, arms up, confetti
 *   sleepy   eyes shut, "z z"
 */
const INK = '#0f3f45';
const ARM = '#7fcbc5';

const ARMS_DOWN = `<ellipse cx="18" cy="76" rx="8" ry="10" transform="rotate(25 18 76)" fill="${ARM}"/>
  <ellipse cx="102" cy="76" rx="8" ry="10" transform="rotate(-25 102 76)" fill="${ARM}"/>`;
const ARMS_UP = `<ellipse cx="19" cy="50" rx="8" ry="11" transform="rotate(-35 19 50)" fill="${ARM}"/>
  <ellipse cx="101" cy="50" rx="8" ry="11" transform="rotate(35 101 50)" fill="${ARM}"/>`;

const OPEN_EYES = `<ellipse cx="45" cy="59" rx="5.2" ry="7" fill="${INK}"/><ellipse cx="75" cy="59" rx="5.2" ry="7" fill="${INK}"/>
  <circle cx="47" cy="56" r="2" fill="#fff"/><circle cx="77" cy="56" r="2" fill="#fff"/>`;
const HAPPY_EYES = `<g stroke="${INK}" stroke-width="3.2" stroke-linecap="round" fill="none"><path d="M39 61 Q45 54 51 61"/><path d="M69 61 Q75 54 81 61"/></g>`;
const OPEN_MOUTH = `<path d="M50 70 Q60 86 70 70 Z" fill="${INK}"/><path d="M54.5 76.5 Q60 81.5 65.5 76.5 Q60 73.5 54.5 76.5Z" fill="#f49aa5"/>`;

const FACES: Record<Mood, { arms: string; face: string; extra: string; leafTilt: number }> = {
  calm: {
    arms: ARMS_DOWN,
    face: `${OPEN_EYES}<path d="M53 71 Q60 78 67 71" stroke="${INK}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`,
    extra: '',
    leafTilt: 0,
  },
  excited: {
    arms: ARMS_UP,
    face: `<ellipse cx="45" cy="58" rx="6" ry="8" fill="${INK}"/><ellipse cx="75" cy="58" rx="6" ry="8" fill="${INK}"/>
      <circle cx="47.5" cy="54.5" r="2.4" fill="#fff"/><circle cx="77.5" cy="54.5" r="2.4" fill="#fff"/>
      <circle cx="43" cy="61" r="1.1" fill="#fff"/><circle cx="73" cy="61" r="1.1" fill="#fff"/>${OPEN_MOUTH}`,
    extra: `<path d="M8 22 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" fill="#ffc94d"/>
      <path d="M108 30 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8z" fill="#ffc94d"/>`,
    leafTilt: -6,
  },
  nervous: {
    arms: ARMS_DOWN,
    face: `<ellipse cx="45" cy="59" rx="7" ry="8" fill="#fff"/><ellipse cx="75" cy="59" rx="7" ry="8" fill="#fff"/>
      <circle cx="45" cy="60" r="3.2" fill="${INK}"/><circle cx="75" cy="60" r="3.2" fill="${INK}"/>
      <g stroke="${INK}" stroke-width="2.6" stroke-linecap="round" fill="none"><path d="M37 47 L50 50"/><path d="M83 47 L70 50"/>
      <path d="M51 75 q3 -3 6 0 t6 0 t6 0"/></g>`,
    extra: `<path d="M98 30 C98 30 91 40 91 44.5 A7 7 0 0 0 105 44.5 C105 40 98 30 98 30Z" fill="#7cc8f2" stroke="#3f9fd6" stroke-width="1.5"/>
      <ellipse cx="96" cy="44" rx="1.8" ry="2.6" fill="#fff" opacity="0.85"/>`,
    leafTilt: 4,
  },
  party: {
    arms: ARMS_UP,
    face: `${HAPPY_EYES}${OPEN_MOUTH}`,
    extra: `<g transform="rotate(14 60 22)"><path d="M48 26 L60 -2 L72 26 Z" fill="#ff7a59"/>
      <path d="M51.5 18 L68.5 18 M54.5 11 L65.5 11" stroke="#ffd35c" stroke-width="3.2"/><circle cx="60" cy="-2" r="4.2" fill="#ffd35c"/></g>
      <rect x="6" y="18" width="7" height="4" rx="1.5" transform="rotate(-30 9 20)" fill="#ff6fa8"/>
      <rect x="104" y="14" width="7" height="4" rx="1.5" transform="rotate(25 107 16)" fill="#4c9aff"/>
      <rect x="2" y="62" width="6" height="3.5" rx="1.5" transform="rotate(40 5 64)" fill="#ffc94d"/>
      <rect x="110" y="66" width="6" height="3.5" rx="1.5" transform="rotate(-35 113 68)" fill="#58c46a"/>
      <circle cx="20" cy="8" r="2.6" fill="#58c46a"/><circle cx="96" cy="6" r="2.4" fill="#ff7a59"/>
      <circle cx="113" cy="44" r="2.2" fill="#ff6fa8"/><circle cx="7" cy="40" r="2.2" fill="#4c9aff"/>`,
    leafTilt: 0,
  },
  sleepy: {
    arms: ARMS_DOWN,
    face: `<g stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"><path d="M39 58 Q45 63 51 58"/><path d="M69 58 Q75 63 81 58"/></g>
      <ellipse cx="60" cy="74" rx="3.6" ry="3" fill="${INK}"/>`,
    extra: `<g stroke="#5f8f8c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M90 26 h8 l-8 9 h8"/><path d="M103 12 h6 l-6 7 h6"/></g>`,
    leafTilt: 10,
  },
};

export function hidiSvg(mood: Mood = 'calm') {
  const f = FACES[mood];
  // The party hat sits where the leaves are.
  const leaves =
    mood === 'party'
      ? ''
      : `<g transform="rotate(${f.leafTilt} 60 24)">
  <path d="M60 26 C59 18 61 13 64 9" stroke="#3a9295" stroke-width="3.4" stroke-linecap="round" fill="none"/>
  <path d="M63 12 C70 3 82 4 85 9 C80 16 70 17 63 12Z" fill="url(#l)"/>
  <path d="M61 15 C54 8 44 9 42 14 C47 20 56 20 61 15Z" fill="url(#l)"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -6 120 130">
  <defs>
    <radialGradient id="b" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#f0faf8"/><stop offset="0.45" stop-color="#9ed5d1"/><stop offset="1" stop-color="#63c1bb"/></radialGradient>
    <radialGradient id="s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6f5f2"/><stop offset="1" stop-color="#63c1bb"/></linearGradient>
  </defs>
  <ellipse cx="60" cy="116" rx="30" ry="5" fill="#0f3f45" opacity="0.18"/>
  ${leaves}
  ${f.arms}
  <ellipse cx="44" cy="105" rx="11" ry="7" fill="#4faaa8"/>
  <ellipse cx="76" cy="105" rx="11" ry="7" fill="#4faaa8"/>
  <path d="M60 24 C90 24 104 40 104 66 C104 93 88 106 60 106 C32 106 16 93 16 66 C16 40 30 24 60 24Z" fill="url(#b)"/>
  <path d="M28 90 C40 104 82 106 96 88 C92 100 80 106 60 106 C40 106 31 99 28 90Z" fill="#3a9295" opacity="0.35"/>
  <ellipse cx="42" cy="40" rx="15" ry="9" transform="rotate(-20 42 40)" fill="url(#s)"/>
  <rect x="47" y="80" width="26" height="17" rx="5" fill="#ffffff" opacity="0.92"/>
  <path d="M48.5 82 L60 90 L71.5 82" stroke="#c8e6e2" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <ellipse cx="33" cy="70" rx="7" ry="4.5" fill="#f7b7be" opacity="${mood === 'nervous' ? 0.25 : 0.55}"/>
  <ellipse cx="87" cy="70" rx="7" ry="4.5" fill="#f7b7be" opacity="${mood === 'nervous' ? 0.25 : 0.55}"/>
  ${f.face}
  ${f.extra}
</svg>`;
}

/** Hidi's size ratio (viewBox 120 × 130): height for a given width. */
export const hidiHeight = (width: number) => Math.round((width * 130) / 120);

// ---- countdown kind icons: the website's icons (src/components/icons.tsx), white on the accent color

const KIND_PATHS: Record<string, string> = {
  exam: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 3.5h6v2.5H9zM8.5 11l2 2 4-4M8.5 16.5h7"/>',
  graduation: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3V11M21.5 9v5"/>',
  birthday:
    '<path d="M4 20.5h16M5 20.5v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"/><path d="M5 15.5c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 5 0M12 11.5V8"/><path d="M12 3.5c1 1.2 1.2 2.4 0 3.5-1.2-1.1-1-2.3 0-3.5z" fill="#fff"/>',
  wedding: '<circle cx="9" cy="14.5" r="5.5"/><circle cx="15" cy="14.5" r="5.5"/><path d="m7 5 2 2.5 2-2.5-1-1.5H8z"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18M11 12.5v1.5h2v-1.5"/>',
  trip: '<path d="M10.5 13.5 3 11l1.5-1.5 8 .5 4-4.5c1-1 2.6-1.4 3.2-.7.7.6.3 2.2-.7 3.2L14.5 12l.5 8-1.5 1.5-2.5-7.5-3 2.5.5 2.5-1.2 1.2-1.6-3.3L2.4 15.3 3.6 14l2.5.5z"/>',
  life: '<path d="M12 21v-8M12 13c0-4 2.5-6.5 7.5-6.5 0 4.5-2.5 6.5-7.5 6.5zM12 15.5c0-3.5-2-5.5-6.5-5.5 0 3.8 2 5.5 6.5 5.5z"/>',
  deadline: '<path d="M5 21V4M5 4.5c4-2 7 2 11 0v8.5c-4 2-7-2-11 0"/>',
};

/** Each kind's color: the progress bar and the icon's tile. All read on white and on the dark card. */
export const KIND_ACCENT: Record<string, string> = {
  exam: '#f29b2e',
  graduation: '#8b7cf6',
  birthday: '#ee5f9f',
  wedding: '#e2607a',
  work: '#3f8cf0',
  trip: '#1fa8d8',
  life: '#4cb860',
  deadline: '#f2734f',
};

export const accentOf = (kind: string) => KIND_ACCENT[kind] ?? KIND_ACCENT.deadline;

/** The kind's icon on a rounded tile in its accent color. */
export function kindSvg(kind: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <rect width="40" height="40" rx="12" fill="${accentOf(kind)}"/>
  <g transform="translate(8 8)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${KIND_PATHS[kind] ?? KIND_PATHS.deadline}</g>
</svg>`;
}

/** The list's "checkbox": filled with a tick for the countdown on show, an empty ring otherwise. */
export function checkSvg(on: boolean, color: string, ring: string) {
  return on
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="${color}"/><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none" stroke="${ring}" stroke-width="2.6"/></svg>`;
}

/** The chunky ‹ › glyphs, drawn (fonts' angle brackets are thin). */
export function chevronSvg(dir: 'left' | 'right', color: string) {
  const d = dir === 'left' ? 'M14.5 6 L8.5 12 L14.5 18' : 'M9.5 6 L15.5 12 L9.5 18';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${d}" stroke="${color}" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
