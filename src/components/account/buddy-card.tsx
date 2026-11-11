"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * "Your buddy" on /account, folded until it's wanted: the builder is long, and most visits are
 * for something else. Opens on its own when you follow a link to #buddy ("Change your buddy").
 */
export function BuddyCard({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fromHash() {
      if (window.location.hash !== "#buddy") return;
      setOpen(true);
      requestAnimationFrame(() => ref.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  return (
    <div id="buddy" ref={ref} className="card scroll-mt-24 p-5 sm:p-6">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="buddy-builder"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block font-display text-lg font-semibold text-heading">Your buddy</span>
          <span className="block text-sm text-ink-soft">Colors, eyes, mouth and more</span>
        </span>
        <span className="rounded-full border border-line px-3 py-1.5 text-sm font-bold text-accent">{open ? "Done" : "Customize"}</span>
      </button>
      {open && (
        <div id="buddy-builder" className="mt-5">
          {children}
        </div>
      )}
    </div>
  );
}
