"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** A bit under the 15-minute life of a view link (VIEW_LINK_SECONDS in src/lib/storage/types.ts). */
const EVERY_MS = 12 * 60 * 1000;

/**
 * Photo links last 15 minutes, so a page left open (the memories board, a long scroll through
 * the calendar) would end up with links that no longer load. Every 12 minutes, while the tab is
 * visible, this re-renders the page from the server, which signs fresh links; the service worker
 * still serves photos already seen from the device. It waits while a video plays, since a new
 * link would restart it.
 */
export function MediaLinkRefresher() {
  const router = useRouter();
  const last = useRef(0);

  useEffect(() => {
    last.current = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible" || Date.now() - last.current < EVERY_MS) return;
      if (Array.from(document.querySelectorAll("video")).some((v) => !v.paused)) return;
      last.current = Date.now();
      router.refresh();
    };
    const timer = window.setInterval(tick, 60 * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);

  return null;
}
