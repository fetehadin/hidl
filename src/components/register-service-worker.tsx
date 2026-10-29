"use client";

import { useEffect } from "react";

/** Registers the no-op service worker that makes the home-screen install prompt available. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
