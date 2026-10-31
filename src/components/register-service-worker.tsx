"use client";

import { useEffect } from "react";

/** Registers public/sw.js: makes the home-screen install available and caches photo files. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
