"use client";

import { useSyncExternalStore } from "react";
import { THEME_COOKIE, THEME_INFO, type Theme, parseTheme } from "@/lib/theme";

// The current theme is the `data-theme` attribute on <html> (set by the root layout from the
// cookie). Components read it from there, so every switch on the page updates together.

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function useTheme(serverTheme: Theme): Theme {
  return useSyncExternalStore(
    subscribe,
    () => parseTheme(document.documentElement.dataset.theme),
    () => serverTheme,
  );
}

/** Switches at once (no reload) and remembers it on this device for a year. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax${secure}`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_INFO[theme].color);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", THEME_INFO[theme].scheme);
}
