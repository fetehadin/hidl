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
  { href: "/calendar?add=today", hint: "Add today's photo", Icon: CameraIcon },
  { href: "/letters/new", hint: "Write a letter", Icon: EnvelopeIcon },
  { href: "/countdown/new", hint: "Start a countdown", Icon: HourglassIcon },
  { href: "/memories", hint: "Open your memories", Icon: MemoriesIcon },
] as const;

/** Fan radius (px) and each shortcut's angle, from straight up (90°) round to the left (180°). */
const RADIUS = 122;
const ANGLES = [90, 120, 150, 180];

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
      className="fixed bottom-[calc(4.6rem+var(--safe-bottom))] right-3 z-40 size-16 sm:right-5 sm:bottom-4"
    >
      <ul id="hidi-menu" aria-label="Shortcuts" className={open ? "" : "pointer-events-none"}>
        {ACTIONS.map(({ href, hint, Icon }, i) => {
          const angle = ANGLES[i];
          const pos = polar(angle, RADIUS);
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
                className="group absolute top-1/2 left-1/2 grid size-[3.25rem] place-items-center rounded-full border-2 border-aqua bg-white text-teal shadow-[0_6px_0_var(--aqua),0_14px_28px_-12px_rgb(var(--shadow)/0.45)] transition-[translate,scale,opacity,background-color] duration-[420ms] ease-[cubic-bezier(.34,1.56,.64,1)] hover:bg-mint"
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
        className={`relative grid size-16 place-items-center rounded-full border-2 bg-white shadow-[0_5px_0_var(--aqua),0_14px_30px_-14px_rgb(var(--shadow)/0.5)] transition-[transform,border-color] duration-150 active:scale-95 ${
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
