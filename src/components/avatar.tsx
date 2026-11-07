"use client";

import { useId } from "react";
import { AVATAR_THEMES, type AvatarConfig } from "@/lib/avatar";

/**
 * A user's buddy: Hidi's squishy shape, recolored and dressed up from an AvatarConfig
 * (src/lib/avatar.ts), in a round badge. Character coordinates match src/components/mascot.tsx
 * (viewBox 120×124), scaled into a 120×120 circle. Purely decorative unless `label` is passed.
 */
// Eyes and mouth: dark teal or midnight navy, with the theme.
const INK = "var(--hidi-ink)";
const PINK = "#f49aa5";

export type BuddyMood = "happy" | "wave" | "cheer" | "sleepy" | "curious" | "hi";

/** Gradients a BuddyFigure needs, keyed by a unique prefix (one set per <svg>). */
export function BuddyDefs({ id, config }: { id: string; config: AvatarConfig }) {
  const t = AVATAR_THEMES[config.theme] ?? AVATAR_THEMES.mint;
  return (
    <>
      <radialGradient id={`${id}-b`} cx="38%" cy="30%" r="78%">
        <stop offset="0" stopColor={t.light} />
        <stop offset="0.45" stopColor={t.mid} />
        <stop offset="1" stopColor={t.dark} />
      </radialGradient>
      <radialGradient id={`${id}-s`} cx="50%" cy="50%" r="50%">
        <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
    </>
  );
}

/**
 * The buddy itself, in Hidi's coordinates (120×124, same as src/components/mascot.tsx), so it
 * can stand in for Hidi anywhere. `mood` borrows Hidi's poses: cheer raises the arms, wave
 * waves, sleepy closes the eyes; otherwise the face is the one the user picked.
 */
export function BuddyFigure({
  config,
  mood = "happy",
  bodyFill,
  shineFill,
}: {
  config: AvatarConfig;
  mood?: BuddyMood;
  bodyFill: string;
  shineFill: string;
}) {
  const t = AVATAR_THEMES[config.theme] ?? AVATAR_THEMES.mint;
  const eyes = mood === "sleepy" ? "sleepy" : mood === "cheer" ? "happy" : config.eyes;
  const mouth = mood === "cheer" || mood === "hi" ? "grin" : mood === "sleepy" ? "o" : config.mouth;
  return (
    <>
      <g className={mood === "cheer" ? "mascot-cheer" : undefined}>
        <Top kind={config.top} bodyFill={bodyFill} t={t} />
      </g>

      {/* arms (behind the body), posed like Hidi's */}
      {mood === "cheer" ? (
        <>
          <ellipse cx="19" cy="52" rx="8" ry="11" transform="rotate(-35 19 52)" fill={t.limb} />
          <ellipse cx="101" cy="52" rx="8" ry="11" transform="rotate(35 101 52)" fill={t.limb} />
        </>
      ) : mood === "wave" ? (
        <>
          <ellipse cx="18" cy="76" rx="8" ry="10" transform="rotate(25 18 76)" fill={t.limb} />
          <g className="mascot-wave">
            <ellipse cx="103" cy="52" rx="8" ry="12" transform="rotate(30 103 52)" fill={t.limb} />
          </g>
        </>
      ) : (
        <>
          <ellipse cx="18" cy="76" rx="8" ry="10" transform="rotate(25 18 76)" fill={t.limb} />
          <ellipse cx="102" cy="76" rx="8" ry="10" transform="rotate(-25 102 76)" fill={t.limb} />
        </>
      )}
      <ellipse cx="44" cy="105" rx="11" ry="7" fill={t.foot} />
      <ellipse cx="76" cy="105" rx="11" ry="7" fill={t.foot} />

      {/* body */}
      <path d="M60 24 C90 24 104 40 104 66 C104 93 88 106 60 106 C32 106 16 93 16 66 C16 40 30 24 60 24Z" fill={bodyFill} />
      <path d="M28 90 C40 104 82 106 96 88 C92 100 80 106 60 106 C40 106 31 99 28 90Z" fill={t.shade} opacity="0.35" />
      <ellipse cx="42" cy="40" rx="15" ry="9" transform="rotate(-20 42 40)" fill={shineFill} />
      <ellipse cx="60" cy="90" rx="17" ry="10" fill="#fff" opacity="0.35" />

      {/* cheeks */}
      <ellipse cx="33" cy="70" rx="7" ry="4.5" fill="#f7b7be" opacity="0.6" />
      <ellipse cx="87" cy="70" rx="7" ry="4.5" fill="#f7b7be" opacity="0.6" />

      <g className={eyes === "round" || eyes === "big" ? "mascot-eyes" : undefined}>
        <Eyes kind={eyes} />
      </g>
      <Mouth kind={mouth} />
      <Extra kind={config.extra} />

      {mood === "sleepy" && (
        <text className="mascot-zz" x="90" y="36" fontSize="15" fontWeight="800" fill={t.shade} fontFamily="var(--font-body), sans-serif">
          z
        </text>
      )}
      {mood === "curious" && (
        <text x="96" y="36" fontSize="18" fontWeight="800" fill={t.shade} fontFamily="var(--font-body), sans-serif">
          ?
        </text>
      )}
    </>
  );
}

export function Avatar({
  config,
  size = 40,
  label,
  className = "",
}: {
  config: AvatarConfig;
  size?: number;
  label?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const t = AVATAR_THEMES[config.theme] ?? AVATAR_THEMES.mint;
  const body = `${id}-b`;
  const shine = `${id}-s`;
  const clip = `${id}-c`;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };

  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={`shrink-0 ${className}`} {...a11y}>
      <defs>
        <radialGradient id={body} cx="38%" cy="30%" r="78%">
          <stop offset="0" stopColor={t.light} />
          <stop offset="0.45" stopColor={t.mid} />
          <stop offset="1" stopColor={t.dark} />
        </radialGradient>
        <radialGradient id={shine} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={clip}>
          <circle cx="60" cy="60" r="60" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${clip})`}>
        <circle cx="60" cy="60" r="60" fill={t.bg} />
        <Background kind={config.bg} color={t.pattern} />

        <g transform="translate(12 19) scale(0.8)">
          <BuddyFigure config={config} bodyFill={`url(#${body})`} shineFill={`url(#${shine})`} />
        </g>
      </g>
    </svg>
  );
}

type Theme = (typeof AVATAR_THEMES)[keyof typeof AVATAR_THEMES];

function starPath(cx: number, cy: number, outer: number, inner: number, points = 5) {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join(" L")}Z`;
}

const heartPath = (x: number, y: number, s: number) =>
  `M${x} ${y + s * 0.3} C${x} ${y - s * 0.2} ${x - s} ${y - s * 0.2} ${x - s} ${y + s * 0.3} C${x - s} ${y + s * 0.8} ${x} ${y + s} ${x} ${y + s * 1.3} C${x} ${y + s} ${x + s} ${y + s * 0.8} ${x + s} ${y + s * 0.3} C${x + s} ${y - s * 0.2} ${x} ${y - s * 0.2} ${x} ${y + s * 0.3}Z`;

// Fixed positions so server and client render identical markup.
const SPOTS = [
  [16, 22], [42, 10], [78, 12], [104, 26], [10, 52], [110, 58], [18, 86], [102, 92], [36, 108], [86, 108], [60, 4], [8, 74],
] as const;

function Background({ kind, color }: { kind: AvatarConfig["bg"]; color: string }) {
  switch (kind) {
    case "dots":
      return (
        <g fill={color}>
          {SPOTS.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 4.5 : 3} />
          ))}
        </g>
      );
    case "stars":
      return (
        <g fill={color}>
          {SPOTS.map(([x, y], i) => (
            <path key={i} d={starPath(x, y, i % 2 ? 6 : 4.5, i % 2 ? 2.6 : 2, 4)} />
          ))}
        </g>
      );
    case "hearts":
      return (
        <g fill={color}>
          {SPOTS.filter((_, i) => i % 2 === 0 || i > 8).map(([x, y], i) => (
            <path key={i} d={heartPath(x, y - 3, 4)} />
          ))}
        </g>
      );
    case "waves":
      return (
        <g fill="none" stroke={color} strokeWidth="5" strokeLinecap="round">
          {[20, 44, 96, 112].map((y) => (
            <path key={y} d={`M-6 ${y} Q9 ${y - 7} 24 ${y} T54 ${y} T84 ${y} T114 ${y} T144 ${y}`} />
          ))}
        </g>
      );
    default:
      return null;
  }
}

function Top({ kind, bodyFill, t }: { kind: AvatarConfig["top"]; bodyFill: string; t: Theme }) {
  switch (kind) {
    case "sprout":
      return (
        <g>
          <path d="M60 26 C59 18 61 13 64 9" stroke={t.shade} strokeWidth="3.4" strokeLinecap="round" fill="none" />
          <path d="M63 12 C70 3 82 4 85 9 C80 16 70 17 63 12Z" fill={t.mid} />
          <path d="M61 15 C54 8 44 9 42 14 C47 20 56 20 61 15Z" fill={t.dark} />
        </g>
      );
    case "bunny":
      return (
        <g>
          <ellipse cx="43" cy="14" rx="9" ry="22" transform="rotate(-14 43 14)" fill={bodyFill} />
          <ellipse cx="77" cy="14" rx="9" ry="22" transform="rotate(14 77 14)" fill={bodyFill} />
          <ellipse cx="43" cy="15" rx="4.5" ry="15" transform="rotate(-14 43 15)" fill={PINK} opacity="0.7" />
          <ellipse cx="77" cy="15" rx="4.5" ry="15" transform="rotate(14 77 15)" fill={PINK} opacity="0.7" />
        </g>
      );
    case "cat":
      return (
        <g strokeLinejoin="round">
          <path d="M24 44 L30 12 L54 28 Z" fill={t.dark} stroke={t.dark} strokeWidth="4" />
          <path d="M96 44 L90 12 L66 28 Z" fill={t.dark} stroke={t.dark} strokeWidth="4" />
          <path d="M31 36 L33 20 L46 29 Z" fill={PINK} opacity="0.75" />
          <path d="M89 36 L87 20 L74 29 Z" fill={PINK} opacity="0.75" />
        </g>
      );
    case "horns":
      return (
        <g fill="#fff4dc" stroke={t.shade} strokeWidth="2.5" strokeLinejoin="round">
          <path d="M38 34 C32 22 34 12 42 6 C41 16 46 24 50 29 Z" />
          <path d="M82 34 C88 22 86 12 78 6 C79 16 74 24 70 29 Z" />
        </g>
      );
    case "antenna":
      return (
        <g>
          <path d="M60 26 L60 9" stroke={t.shade} strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="60" cy="7" r="6.5" fill={PINK} />
          <circle cx="58" cy="5" r="2" fill="#fff" opacity="0.8" />
        </g>
      );
    default:
      return null;
  }
}

function Eyes({ kind }: { kind: AvatarConfig["eyes"] }) {
  const roundEye = (cx: number) => (
    <g key={cx}>
      <ellipse cx={cx} cy="59" rx="5.2" ry="7" fill={INK} />
      <circle cx={cx + 2} cy="56" r="2" fill="#fff" />
    </g>
  );
  switch (kind) {
    case "happy":
      return (
        <g stroke={INK} strokeWidth="3.4" strokeLinecap="round" fill="none">
          <path d="M39 62 Q45 53 51 62" />
          <path d="M69 62 Q75 53 81 62" />
        </g>
      );
    case "sleepy":
      return (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M39 60 Q45 65 51 60" />
          <path d="M69 60 Q75 65 81 60" />
        </g>
      );
    case "star":
      return (
        <g fill={INK}>
          <path d={starPath(45, 59, 8, 3.6)} />
          <path d={starPath(75, 59, 8, 3.6)} />
        </g>
      );
    case "wink":
      return (
        <g>
          {roundEye(45)}
          <path d="M69 61 Q75 55 81 61" stroke={INK} strokeWidth="3.2" strokeLinecap="round" fill="none" />
        </g>
      );
    case "big":
      return (
        <g>
          {[45, 75].map((cx) => (
            <g key={cx}>
              <ellipse cx={cx} cy="59" rx="7" ry="8.5" fill={INK} />
              <circle cx={cx + 2.5} cy="55.5" r="2.6" fill="#fff" />
              <circle cx={cx - 2.4} cy="62.5" r="1.3" fill="#fff" />
            </g>
          ))}
        </g>
      );
    default:
      return <g>{[45, 75].map(roundEye)}</g>;
  }
}

function Mouth({ kind }: { kind: AvatarConfig["mouth"] }) {
  const line = { stroke: INK, strokeWidth: 2.8, strokeLinecap: "round" as const, fill: "none" };
  switch (kind) {
    case "grin":
      return (
        <g>
          <path d="M51 70 Q60 84 69 70 Z" fill={INK} />
          <path d="M55 76 Q60 80.5 65 76 Q60 73.5 55 76Z" fill={PINK} />
        </g>
      );
    case "o":
      return <ellipse cx="60" cy="74" rx="4" ry="4.8" fill={INK} />;
    case "tongue":
      return (
        <g>
          <path d="M63 74 Q63 81 67 80 Q70 79 68 72" fill={PINK} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M52 71 Q60 78 68 71" {...line} />
        </g>
      );
    case "cat":
      return <path d="M51 71 Q55.5 77 60 72 Q64.5 77 69 71" {...line} />;
    case "flat":
      return <path d="M54 74 L66 74" {...line} />;
    default:
      return <path d="M53 71 Q60 78 67 71" {...line} />;
  }
}

function Extra({ kind }: { kind: AvatarConfig["extra"] }) {
  switch (kind) {
    case "glasses":
      return (
        <g fill="none" stroke={INK} strokeWidth="2.6">
          <circle cx="45" cy="59" r="10.5" fill="#fff" fillOpacity="0.25" />
          <circle cx="75" cy="59" r="10.5" fill="#fff" fillOpacity="0.25" />
          <path d="M55.5 58 Q60 55 64.5 58" strokeLinecap="round" />
        </g>
      );
    case "bow":
      return (
        <g transform="translate(86 32) rotate(18)">
          <path d="M0 0 L-14 -9 Q-17 0 -14 9 Z" fill="#f27a93" />
          <path d="M0 0 L14 -9 Q17 0 14 9 Z" fill="#f27a93" />
          <circle r="4.5" fill="#e0587a" />
        </g>
      );
    case "cap":
      return (
        <g>
          <path d="M38 30 Q60 38 82 30 L82 22 L38 22 Z" fill="#1f3b44" />
          <path d="M26 21 L60 8 L94 21 L60 34 Z" fill="#2a4f5a" />
          <circle cx="60" cy="21" r="2.4" fill="#f0c445" />
          <path d="M60 21 Q80 24 86 38" stroke="#f0c445" strokeWidth="2" fill="none" />
          <path d="M83 36 L86 46 L89 36 Z" fill="#f0c445" />
        </g>
      );
    case "headphones":
      return (
        <g>
          <path d="M20 64 C18 26 102 26 100 64" stroke="#2f4b55" strokeWidth="6" fill="none" strokeLinecap="round" />
          <rect x="9" y="54" width="15" height="24" rx="7" fill="#2f4b55" />
          <rect x="96" y="54" width="15" height="24" rx="7" fill="#2f4b55" />
          <rect x="12" y="58" width="6" height="16" rx="3" fill={PINK} />
          <rect x="102" y="58" width="6" height="16" rx="3" fill={PINK} />
        </g>
      );
    case "flower":
      return (
        <g transform="translate(34 32)">
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="0" cy="-7" rx="5" ry="7" transform={`rotate(${a})`} fill="#fff" />
          ))}
          <circle r="4.5" fill="#f0c445" />
        </g>
      );
    default:
      return null;
  }
}
