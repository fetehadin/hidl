"use client";

import { useEffect } from "react";
import { forgetLetterKeys } from "@/lib/key-store";

/**
 * Wipes the service worker's photo cache (public/sw.js) and the remembered letter key
 * (src/lib/key-store.ts). Rendered on the sign-in page, which is where sign-out and account
 * deletion land, so no one's photos or letters stay readable on a shared device after they leave.
 */
export function ClearPhotoCache() {
  useEffect(() => {
    void forgetLetterKeys();
    if (!("caches" in window)) return;
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("hidl-photos-")).map((n) => caches.delete(n))))
      .catch(() => {});
  }, []);
  return null;
}
