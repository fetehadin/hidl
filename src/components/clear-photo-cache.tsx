"use client";

import { useEffect } from "react";
import { forgetLetterKeys } from "@/lib/key-store";
import { clearSaved } from "@/lib/offline-storage";

/**
 * Wipes what the service worker saved for offline use (photos and pages, public/sw.js) and the
 * remembered letter key (src/lib/key-store.ts). Rendered on the sign-in page, which is where
 * sign-out and account deletion land, so no one's journal stays readable on a shared device after
 * they leave. The storage settings themselves stay: they belong to the device.
 */
export function ClearPhotoCache() {
  useEffect(() => {
    void forgetLetterKeys();
    clearSaved().catch(() => {});
  }, []);
  return null;
}
