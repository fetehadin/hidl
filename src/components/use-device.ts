"use client";

import { useSyncExternalStore } from "react";

export type Device = "app" | "android" | "iphone" | "other";

// The phone app's web view appends this to its user agent (APP_UA in mobile/src/config.ts).
const APP_UA = "hidl-app/";

function read(): Device {
  const ua = navigator.userAgent;
  if (ua.includes(APP_UA)) return "app";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iphone";
  return "other";
}

const subscribe = () => () => {};

/** The visitor's kind of device, or null during server rendering (the user agent never changes). */
export function useDevice(): Device | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
