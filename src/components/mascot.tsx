"use client";

import { useId, type ReactNode } from "react";

/**
 * Hidi, the app's companion: a squishy aqua puff with a sprout on top
 * (something small that keeps growing through senior year). Drawn as flat
 * "clay" shapes: soft radial shading, no outlines, so it matches the UI.
 *
 * Purely decorative unless `label` is passed, in which case it gets role="img".
 */
export type MascotMood = "happy" | "wave" | "cheer" | "sleepy" | "curious";

const INK = "#0f3f45";

export function Mascot({
  mood = "happy",
  size = 96,
  float = true,
  label,
  className = "",
}: {
  mood?: MascotMood;
  size?: number;
  float?: boolean;
  label?: string;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const body = `${id}-body`;
  const shine = `${id}-shine`;
  const leaf = `${id}-leaf`;

  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };

  return (
    <svg
      viewBox="0 0 120 124"
      width={size}
      height={(size * 124) / 120}
      className={`mascot shrink-0 ${className}`}
      {...a11y}
    >
      <defs>
        <radialGradient id={body} cx="38%" cy="30%" r="78%">
          <stop offset="0" stopColor="#f0faf8" />
          <stop offset="0.45" stopColor="#9ed5d1" />
          <stop offset="1" stopColor="#63c1bb" />
        </radialGradient>
        <radialGradient id={shine} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={leaf} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e6f5f2" />
          <stop offset="1" stopColor="#63c1bb" />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse className={float ? "mascot-shadow" : undefined} cx="60" cy="116" rx="30" ry="5" fill="#63c1bb" opacity="0.35" />

      <g className={float ? "mascot-float" : undefined}>
        {/* sprout */}
        <g className={mood === "cheer" ? "mascot-cheer" : undefined}>
          <path d="M60 26 C59 18 61 13 64 9" stroke="#3a9295" strokeWidth="3.4" strokeLinecap="round" fill="none" />
          <path d="M63 12 C70 3 82 4 85 9 C80 16 70 17 63 12Z" fill={`url(#${leaf})`} />
          <path d="M61 15 C54 8 44 9 42 14 C47 20 56 20 61 15Z" fill={`url(#${leaf})`} />
        </g>

        {/* arms (behind the body) */}
        {mood === "cheer" ? (
          <>
            <ellipse cx="19" cy="52" rx="8" ry="11" transform="rotate(-35 19 52)" fill="#7fcbc5" />
            <ellipse cx="101" cy="52" rx="8" ry="11" transform="rotate(35 101 52)" fill="#7fcbc5" />
          </>
        ) : mood === "wave" ? (
          <>
            <ellipse cx="18" cy="76" rx="8" ry="10" transform="rotate(25 18 76)" fill="#7fcbc5" />
            <g className="mascot-wave">
              <ellipse cx="103" cy="52" rx="8" ry="12" transform="rotate(30 103 52)" fill="#7fcbc5" />
            </g>
          </>
        ) : (
          <>
            <ellipse cx="18" cy="76" rx="8" ry="10" transform="rotate(25 18 76)" fill="#7fcbc5" />
            <ellipse cx="102" cy="76" rx="8" ry="10" transform="rotate(-25 102 76)" fill="#7fcbc5" />
          </>
        )}

        {/* feet */}
        <ellipse cx="44" cy="105" rx="11" ry="7" fill="#4faaa8" />
        <ellipse cx="76" cy="105" rx="11" ry="7" fill="#4faaa8" />

        {/* body: a soft squircle puff */}
        <path
          d="M60 24 C90 24 104 40 104 66 C104 93 88 106 60 106 C32 106 16 93 16 66 C16 40 30 24 60 24Z"
          fill={`url(#${body})`}
        />
        {/* clay inner shade + highlight */}
        <path
          d="M28 90 C40 104 82 106 96 88 C92 100 80 106 60 106 C40 106 31 99 28 90Z"
          fill="#3a9295"
          opacity="0.35"
        />
        <ellipse cx="42" cy="40" rx="15" ry="9" transform="rotate(-20 42 40)" fill={`url(#${shine})`} />

        {/* belly patch (a little cream envelope) */}
        <rect x="47" y="80" width="26" height="17" rx="5" fill="#ffffff" opacity="0.92" />
        <path d="M48.5 82 L60 90 L71.5 82" stroke="#c8e6e2" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {/* cheeks */}
        <ellipse cx="33" cy="70" rx="7" ry="4.5" fill="#f7b7be" opacity="0.55" />
        <ellipse cx="87" cy="70" rx="7" ry="4.5" fill="#f7b7be" opacity="0.55" />

        {/* eyes */}
        {mood === "sleepy" ? (
          <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
            <path d="M39 61 Q45 66 51 61" />
            <path d="M69 61 Q75 66 81 61" />
          </g>
        ) : mood === "cheer" ? (
          <g stroke={INK} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
            <path d="M39 62 L45 56 L51 62" />
            <path d="M69 62 L75 56 L81 62" />
          </g>
        ) : (
          <g className="mascot-eyes">
            <ellipse cx="45" cy="59" rx={mood === "curious" ? 6 : 5.2} ry={mood === "curious" ? 8 : 7} fill={INK} />
            <ellipse cx="75" cy="59" rx="5.2" ry="7" fill={INK} />
            <circle cx="47" cy="56" r="2" fill="#fff" />
            <circle cx="77" cy="56" r="2" fill="#fff" />
          </g>
        )}

        {/* mouth */}
        {mood === "cheer" ? (
          <>
            <path d="M51 70 Q60 84 69 70 Z" fill={INK} />
            <path d="M55 76 Q60 80.5 65 76 Q60 73.5 55 76Z" fill="#f49aa5" />
          </>
        ) : mood === "sleepy" ? (
          <ellipse cx="60" cy="73" rx="3" ry="2.6" fill={INK} />
        ) : mood === "curious" ? (
          <path d="M55 74 Q60 71.5 65 74" stroke={INK} strokeWidth="2.8" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M53 71 Q60 78 67 71" stroke={INK} strokeWidth="2.8" strokeLinecap="round" fill="none" />
        )}

        {mood === "sleepy" && (
          <text className="mascot-zz" x="90" y="36" fontSize="15" fontWeight="800" fill="#3a9295" fontFamily="var(--font-display), sans-serif">
            z
          </text>
        )}
        {mood === "curious" && (
          <text x="92" y="38" fontSize="18" fontWeight="800" fill="#3a9295" fontFamily="var(--font-display), sans-serif">
            ?
          </text>
        )}
      </g>
    </svg>
  );
}

/** Mascot + a speech bubble to its right. */
export function MascotSays({
  mood,
  size = 84,
  children,
  className = "",
}: {
  mood?: MascotMood;
  size?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <Mascot mood={mood} size={size} />
      <div className="bubble min-w-0 text-[15px] font-semibold text-ink-soft">{children}</div>
    </div>
  );
}
