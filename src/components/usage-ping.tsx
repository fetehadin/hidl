"use client";

import { useEffect } from "react";
import { recordVisit } from "@/actions/usage";

const KEY = "hidl-visit";

/**
 * Counts a visit for the admin overview's usage numbers: once per browser tab per day, after the page
 * has settled (idle), so it never competes with what the user is looking at. Renders nothing.
 */
export function UsagePing() {
  useEffect(() => {
    const day = new Date().toDateString();
    try {
      if (sessionStorage.getItem(KEY) === day) return;
      sessionStorage.setItem(KEY, day);
    } catch {
      // Storage blocked (private mode): count it anyway, at worst once per page load.
    }
    const send = () => recordVisit().catch(() => {});
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(send, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(send, 2000);
    return () => clearTimeout(t);
  }, []);
  return null;
}
