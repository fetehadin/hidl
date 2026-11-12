"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

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

/**
 * Telegram-style connection line in the header: "Waiting for network…" while Hidl can't be
 * reached, then "Updating…" while the page catches up once it can. Nothing when all is well.
 *
 * Offline, pages open from the copies the service worker saved (public/sw.js). A saved copy says
 * so with <meta name="hidl-saved-at">; it refreshes itself only after the server has answered a
 * health check, because a phone can be "online" (on Wi-Fi) with no internet, and refreshing then
 * would only fail. Moving between pages while waiting goes through whole-page loads, which the
 * worker answers from those copies: Next's own in-app moves would just wait for the network.
 */
export function OfflineStatus() {
  const router = useRouter();
  const [net, setNet] = useState<Net>("ok");
  const waiting = useRef(false);
  const [updating, startUpdate] = useTransition();

  useEffect(() => {
    let savedCopy = document.querySelector('meta[name="hidl-saved-at"]');
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
      const behind = waiting.current || savedCopy !== null;
      set("ok");
      if (behind) {
        savedCopy?.remove();
        savedCopy = null;
        startUpdate(() => router.refresh());
      }
    };
    const lost = () => {
      set("waiting");
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 15_000);
    };

    if (!navigator.onLine) lost();
    else if (savedCopy) void check();

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

  if (net === "ok" && !updating) return null;
  const isWaiting = net === "waiting";
  return (
    <span role="status" className="flex min-w-0 items-center gap-1.5 truncate text-sm font-bold text-muted">
      <span aria-hidden className={`size-2 shrink-0 animate-pulse rounded-full ${isWaiting ? "bg-wax" : "bg-teal"}`} />
      {isWaiting ? "Waiting for network…" : "Updating…"}
    </span>
  );
}
