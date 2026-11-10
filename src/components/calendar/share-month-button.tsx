"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ShareIcon } from "@/components/icons";

// Only needed once tapped.
const ShareSheet = dynamic(() => import("@/components/memories/share-sheet").then((m) => m.ShareSheet), { ssr: false });

/** "Share" on the calendar: a picture of this month's calendar, as the page shows it. */
export function ShareMonthButton({ date, today }: { date: string; today: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-ghost min-h-9 px-2.5 sm:min-h-10 sm:px-3"
        aria-label="Share this calendar as a picture"
        title="Share as a picture"
      >
        <ShareIcon width={18} height={18} />
      </button>
      {open && <ShareSheet calendar initialMode="month" initialDate={date} today={today} onClose={() => setOpen(false)} />}
    </>
  );
}
