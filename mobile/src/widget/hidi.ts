/**
 * Hidi, the mascot, as a fixed SVG for the home-screen widget (widgets can't run React Native
 * components, but SvgWidget draws an SVG string). Same shapes and colors as the website's
 * src/components/mascot.tsx (Teal Paper's --hidi-* tokens), with a happy face, or arms up to cheer.
 */
const INK = '#0f3f45';

export function hidiSvg(mood: 'happy' | 'cheer' = 'happy') {
  const arms =
    mood === 'cheer'
      ? `<ellipse cx="19" cy="52" rx="8" ry="11" transform="rotate(-35 19 52)" fill="#7fcbc5"/>
         <ellipse cx="101" cy="52" rx="8" ry="11" transform="rotate(35 101 52)" fill="#7fcbc5"/>`
      : `<ellipse cx="18" cy="76" rx="8" ry="10" transform="rotate(25 18 76)" fill="#7fcbc5"/>
         <ellipse cx="102" cy="76" rx="8" ry="10" transform="rotate(-25 102 76)" fill="#7fcbc5"/>`;
  const eyes =
    mood === 'cheer'
      ? `<g stroke="${INK}" stroke-width="3" stroke-linecap="round" fill="none"><path d="M39 61 Q45 55 51 61"/><path d="M69 61 Q75 55 81 61"/></g>`
      : `<ellipse cx="45" cy="59" rx="5.2" ry="7" fill="${INK}"/><ellipse cx="75" cy="59" rx="5.2" ry="7" fill="${INK}"/>
         <circle cx="47" cy="56" r="2" fill="#fff"/><circle cx="77" cy="56" r="2" fill="#fff"/>`;
  const mouth =
    mood === 'cheer'
      ? `<path d="M51 70 Q60 84 69 70 Z" fill="${INK}"/><path d="M55 76 Q60 80.5 65 76 Q60 73.5 55 76Z" fill="#f49aa5"/>`
      : `<path d="M53 71 Q60 78 67 71" stroke="${INK}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 124">
  <defs>
    <radialGradient id="b" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#f0faf8"/><stop offset="0.45" stop-color="#9ed5d1"/><stop offset="1" stop-color="#63c1bb"/></radialGradient>
    <radialGradient id="s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6f5f2"/><stop offset="1" stop-color="#63c1bb"/></linearGradient>
  </defs>
  <ellipse cx="60" cy="116" rx="30" ry="5" fill="#0f3f45" opacity="0.18"/>
  <path d="M60 26 C59 18 61 13 64 9" stroke="#3a9295" stroke-width="3.4" stroke-linecap="round" fill="none"/>
  <path d="M63 12 C70 3 82 4 85 9 C80 16 70 17 63 12Z" fill="url(#l)"/>
  <path d="M61 15 C54 8 44 9 42 14 C47 20 56 20 61 15Z" fill="url(#l)"/>
  ${arms}
  <ellipse cx="44" cy="105" rx="11" ry="7" fill="#4faaa8"/>
  <ellipse cx="76" cy="105" rx="11" ry="7" fill="#4faaa8"/>
  <path d="M60 24 C90 24 104 40 104 66 C104 93 88 106 60 106 C32 106 16 93 16 66 C16 40 30 24 60 24Z" fill="url(#b)"/>
  <path d="M28 90 C40 104 82 106 96 88 C92 100 80 106 60 106 C40 106 31 99 28 90Z" fill="#3a9295" opacity="0.35"/>
  <ellipse cx="42" cy="40" rx="15" ry="9" transform="rotate(-20 42 40)" fill="url(#s)"/>
  <rect x="47" y="80" width="26" height="17" rx="5" fill="#ffffff" opacity="0.92"/>
  <path d="M48.5 82 L60 90 L71.5 82" stroke="#c8e6e2" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <ellipse cx="33" cy="70" rx="7" ry="4.5" fill="#f7b7be" opacity="0.55"/>
  <ellipse cx="87" cy="70" rx="7" ry="4.5" fill="#f7b7be" opacity="0.55"/>
  ${eyes}
  ${mouth}
</svg>`;
}
