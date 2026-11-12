"use client";

import { useEffect, useRef, useState } from "react";
import { CloseIcon, WidgetIcon } from "@/components/icons";
import { useDevice } from "@/components/use-device";
import { WidgetToken } from "./widget-token";

/** Opens a dialog to make (or remove) a home-screen widget feed for one countdown. */
export function WidgetButton({ countdown, createdAt }: { countdown: { id: string; title: string }; createdAt: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = `widget-${countdown.id}`;
  const device = useDevice();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // iPads asking for the desktop site get past the server's check; no widget for them either.
  if (device === "iphone") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-semibold text-accent hover:bg-accent-soft"
      >
        <WidgetIcon width={17} height={17} />
        Widget
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
        className="m-auto max-h-[92dvh] w-[min(94vw,34rem)] overflow-y-auto rounded-card border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-mint/70 backdrop:backdrop-blur-[2px]"
      >
        <div className="p-5 sm:p-7">
          <div className="mb-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-display text-xl font-semibold tracking-tight">
                Home screen widget
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-mint hover:text-ink"
            >
              <CloseIcon width={22} height={22} />
            </button>
          </div>
          {open && <WidgetToken createdAt={createdAt} countdown={countdown} bare />}
        </div>
      </dialog>
    </>
  );
}
