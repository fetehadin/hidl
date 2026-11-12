"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";

type Net = "ok" | "waiting";

/** Asks the server's no-data health check whether Hidl can be reached right now. */
async function reachable() {
  try {
    const res = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(6000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Asks the service worker to save every main page for offline use (it decides how often). */
function saveAllPagesSoon() {
  const ask = () => navigator.serviceWorker?.controller?.postMessage({ type: "save-pages" });
  if ("requestIdleCallback" in window) requestIdleCallback(ask, { timeout: 8000 });
  else setTimeout(ask, 3000);
}

/**
 * The header's title, Telegram-style: the Hidl logo (`children`) when all is well; while Hidl
 * can't be reached, "Waiting for network…" in its place, then "Updating…" while the page catches
 * up once it can.
 *
 * Offline, pages open from the copies the service worker saved (public/sw.js). A saved copy says
 * so with window.__hidlSavedAt; it refreshes itself only after the server has answered a
 * health check, because a phone can be "online" (on Wi-Fi) with no internet, and refreshing then
 * would only fail. Moving between pages while waiting goes through whole-page loads, which the
 * worker answers from those copies: Next's own in-app moves would just wait for the network.
 */
export function OfflineStatus({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [net, setNet] = useState<Net>("ok");
  const waiting = useRef(false);
  const [updating, startUpdate] = useTransition();

  useEffect(() => {
    // Set by the service worker on a saved copy (public/sw.js).
    let savedCopy = Boolean((window as { __hidlSavedAt?: number }).__hidlSavedAt);
    let timer: number | undefined;
    let live = true;

    const set = (next: Net) => {
      waiting.current = next === "waiting";
      setNet(next);
    };
    // Try the server; once it answers, refresh what's on screen (a saved copy, or a page that was
    // open while offline). Until then, try again every 15 seconds.
    const check = async () => {
      window.clearTimeout(timer);
      if (!(await reachable())) {
        if (!live) return;
        set("waiting");
        timer = window.setTimeout(check, 15_000);
        return;
      }
      if (!live) return;
      const behind = waiting.current || savedCopy;
      set("ok");
      if (behind) {
        savedCopy = false;
        (window as { __hidlSavedAt?: number }).__hidlSavedAt = 0;
        startUpdate(() => router.refresh());
      }
      saveAllPagesSoon();
    };
    const lost = () => {
      set("waiting");
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 15_000);
    };

    if (!navigator.onLine) lost();
    else if (savedCopy) void check();
    else saveAllPagesSoon();

    // While waiting: follow links with a whole-page load, so the saved copy opens instead of a wait.
    const onClick = (e: MouseEvent) => {
      if (!waiting.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return;
      e.preventDefault();
      e.stopPropagation();
      location.assign(url.href);
    };

    const online = () => void check();
    window.addEventListener("online", online);
    window.addEventListener("offline", lost);
    document.addEventListener("click", onClick, true);
    return () => {
      live = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", lost);
      document.removeEventListener("click", onClick, true);
    };
  }, [router]);

  if (net === "ok" && !updating) return children;
  return (
    <span role="status" className="flex h-10 min-w-0 items-center gap-2.5 font-display text-lg font-bold text-ocean sm:h-12 sm:text-xl">
      <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0 animate-spin text-teal" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="truncate">{net === "waiting" ? "Waiting for network…" : "Updating…"}</span>
    </span>
  );
}
