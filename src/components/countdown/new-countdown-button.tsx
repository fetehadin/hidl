"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "@/components/icons";
import { Mascot } from "@/components/mascot";
import { KindPicker } from "./kind-picker";

/** "New" button that opens a dialog for picking what kind of countdown to add. */
export function NewCountdownButton({ label = "New", className = "" }: { label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button type="button" className={`btn btn-primary ${className}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {label}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="new-countdown-title"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
        className="m-auto max-h-[92dvh] w-[min(94vw,46rem)] overflow-y-auto rounded-card border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-mint/70 backdrop:backdrop-blur-[2px]"
      >
        <div className="p-4 sm:p-7">
          <div className="mb-4 sm:mb-5 flex items-center gap-3">
            <Mascot mood="curious" size={56} float={false} className="hidden sm:block" />
            <div className="min-w-0 flex-1">
              <p className="eyebrow">new countdown</p>
              <h2 id="new-countdown-title" className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                What are you counting down to?
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid size-11 shrink-0 place-items-center self-start rounded-full text-muted hover:bg-mint hover:text-ink"
            >
              <CloseIcon width={22} height={22} />
            </button>
          </div>
          <KindPicker />
        </div>
      </dialog>
    </>
  );
}
