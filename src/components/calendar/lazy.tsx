"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

/*
 * The upload sheet (Supabase browser client + image resizing, ~75 KB gzipped) and the
 * photo viewer aren't needed to show a page, only once someone taps. Splitting them out
 * keeps them off the first load; usePreloadPhotoTools() then fetches them while the page
 * is idle, so the first tap still opens instantly.
 */
const loadUploadSheet = () => import("./upload-sheet");
const loadLightbox = () => import("./lightbox");

export const UploadSheet = dynamic(() => loadUploadSheet().then((m) => m.UploadSheet), { ssr: false });
export const Lightbox = dynamic(() => loadLightbox().then((m) => m.Lightbox), { ssr: false });

export function usePreloadPhotoTools({ lightbox = true }: { lightbox?: boolean } = {}) {
  useEffect(() => {
    const load = () => {
      void loadUploadSheet();
      if (lightbox) void loadLightbox();
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(load, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(load, 1500);
    return () => clearTimeout(id);
  }, [lightbox]);
}
