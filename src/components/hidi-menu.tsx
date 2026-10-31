"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CameraIcon, EnvelopeIcon, HourglassIcon, MemoriesIcon } from "./icons";
import { Mascot } from "./mascot";

/**
 * Hidi sits in the bottom-right corner of every page. Tapping it makes Hidi hop and
 * break into a big smile, and four shortcuts fan out around it in a quarter circle: add today's
 * photo, write a letter, start a countdown, open memories.
 */
const ACTIONS = [
  { href: "/calendar?add=today", label: "Photo", hint: "Add today's photo", Icon: CameraIcon },
  { href: "/letters/new", label: "Letter", hint: "Write a letter", Icon: EnvelopeIcon },
  { href: "/countdown/new", label: "Countdown", hint: "Start a countdown", Icon: HourglassIcon },
  { href: "/memories", label: "Memories", hint: "Open your memories", Icon: MemoriesIcon },
] as const;

/** Fan radius (px) and each shortcut's angle, from straight up (90°) round to the left (180°). */
const RADIUS = 122;
const ANGLES = [90, 120, 150, 180];
/** Rough half-size of a label pill, used to sit each label just outside its button. */
const LABEL = { halfW: 40, halfH: 11 };
const BUTTON_R = 26;

function polar(angle: number, r: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: Math.cos(rad) * r, y: -Math.sin(rad) * r };
}

export function HidiMenu() {
  const [open, setOpen] = useState(false);
  const [hop, setHop] = useState(0);
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close after navigating (a shortcut was used) and on Escape or a tap elsewhere.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  function toggle() {
    setOpen((o) => !o);
    setHop((h) => h + 1);
  }

  return (
    <div
      ref={rootRef}
      className="fixed bottom-[calc(4.6rem+env(safe-area-inset-bottom))] right-3 z-40 size-16 sm:right-5 sm:bottom-4"
    >
      {/* soft mint glow behind the fan */}
      <div
        aria-hidden
        className={`pointer-events-none absolute top-1/2 left-1/2 size-[27rem] rounded-full transition-[opacity,scale] duration-300 ${
          open ? "scale-100 opacity-100" : "scale-50 opacity-0"
        }`}
        style={{
          translate: "-50% -50%",
          background:
            "radial-gradient(circle, rgb(255 255 255 / 0.97) 0%, rgb(240 250 248 / 0.92) 38%, rgb(200 230 226 / 0.6) 55%, transparent 70%)",
        }}
      />

      <ul id="hidi-menu" aria-label="Shortcuts" className={open ? "" : "pointer-events-none"}>
        {ACTIONS.map(({ href, label, hint, Icon }, i) => {
          const angle = ANGLES[i];
          const pos = polar(angle, RADIUS);
          const rad = (angle * Math.PI) / 180;
          const labelDist =
            RADIUS + BUTTON_R + 6 + Math.abs(Math.cos(rad)) * LABEL.halfW + Math.abs(Math.sin(rad)) * LABEL.halfH;
          const lab = polar(angle, labelDist);
          // Opening staggers outward from the top; closing tucks them back in reverse.
          const delay = open ? i * 45 : (ACTIONS.length - 1 - i) * 30;
          return (
            <li key={href}>
              <Link
                href={href}
                tabIndex={open ? 0 : -1}
                aria-hidden={!open}
                aria-label={hint}
                title={hint}
                onClick={() => setOpen(false)}
                className="group absolute top-1/2 left-1/2 grid size-[3.25rem] place-items-center rounded-full border-2 border-aqua bg-white text-teal shadow-[0_6px_0_var(--aqua),0_14px_28px_-12px_rgb(16_95_104/0.45)] transition-[translate,scale,opacity,background-color] duration-[420ms] ease-[cubic-bezier(.34,1.56,.64,1)] hover:bg-mint"
                style={
                  {
                    translate: open
                      ? `calc(-50% + ${pos.x}px) calc(-50% + ${pos.y}px)`
                      : "-50% -50%",
                    scale: open ? "1" : "0.3",
                    opacity: open ? 1 : 0,
                    transitionDelay: `${delay}ms`,
                  } as React.CSSProperties
                }
              >
                <Icon width={24} height={24} strokeWidth={2.2} />
                <span
                  aria-hidden
                  className="pointer-events-none absolute rounded-full bg-white px-2.5 py-0.5 text-xs font-extrabold whitespace-nowrap text-ocean shadow-[0_2px_8px_-2px_rgb(16_95_104/0.3)]"
                  style={{
                    left: "50%",
                    top: "50%",
                    translate: `calc(-50% + ${lab.x - pos.x}px) calc(-50% + ${lab.y - pos.y}px)`,
                  }}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <button
        ref={toggleRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="hidi-menu"
        aria-label={open ? "Close Hidi's shortcuts" : "Hidi: open shortcuts"}
        className={`relative grid size-16 place-items-center rounded-full border-2 bg-white shadow-[0_5px_0_var(--aqua),0_14px_30px_-14px_rgb(16_95_104/0.5)] transition-[transform,border-color] duration-150 active:scale-95 ${
          open ? "border-teal" : "border-aqua hover:border-fresh"
        }`}
      >
        <span
          key={hop}
          className="block"
          style={hop > 0 ? { animation: "hidi-hop 0.55s cubic-bezier(.34,1.56,.64,1)", transformOrigin: "50% 100%" } : undefined}
        >
          <Mascot mood={open ? "hi" : "happy"} size={50} float={false} className="translate-y-0.5" />
        </span>
      </button>
    </div>
  );
}
