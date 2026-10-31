"use client";

import { useEffect } from "react";

/**
 * Wipes the service worker's photo cache (public/sw.js). Rendered on the sign-in page,
 * which is where sign-out and account deletion land, so no one's photos stay on a
 * shared device after they leave.
 */
export function ClearPhotoCache() {
  useEffect(() => {
    if (!("caches" in window)) return;
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("hidl-photos-")).map((n) => caches.delete(n))))
      .catch(() => {});
  }, []);
  return null;
}
