"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { prepareAppWidget } from "@/actions/countdowns";
import { Mascot } from "@/components/mascot";
import { useDevice } from "@/components/use-device";
import { ANDROID_APP_PATH } from "@/lib/android-app";

// What the phone app tells this page (WebShell.tsx in mobile/): `window.hidlApp` before the page
// loads, then "hidl-app" events: how many hidl widgets are on the home screen, and pin answers.
// `shareImage` / `saveImage`: the app can share, or save to a folder, a picture the page made (the
// memories share sheet).
type HidlApp = { pinWidget?: boolean; widgets?: number | null; shareImage?: boolean; saveImage?: boolean };
type AppEvent = { type: "pin-widget"; ok: boolean; supported: boolean } | { type: "widgets"; count: number };

declare global {
  interface Window {
    hidlApp?: HidlApp;
    ReactNativeWebView?: { postMessage(message: string): void };
  }
}

function subscribeApp(onChange: () => void) {
  window.addEventListener("hidl-app", onChange);
  return () => window.removeEventListener("hidl-app", onChange);
}
const appCanPin = () => Boolean(window.hidlApp?.pinWidget && window.ReactNativeWebView);
// null until the app has looked (older app versions never do).
const placedWidgets = () => window.hidlApp?.widgets ?? null;

/**
 * The easy way to a home-screen widget: the hidl Android app's widget, which shows every
 * countdown still to come (scroll through them; new ones appear by themselves). Inside the app
 * it's one tap; Android then asks "Add to Home screen?". Elsewhere it points to the app.
 */
export function AppWidgetHelp({ title }: { title?: string }) {
  const device = useDevice();
  const canPin = useSyncExternalStore(subscribeApp, appCanPin, () => false);
  const widgets = useSyncExternalStore(subscribeApp, placedWidgets, () => null);
  const [status, setStatus] = useState<"idle" | "asked" | "manual" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    function onAnswer(e: Event) {
      const detail = (e as CustomEvent<AppEvent>).detail;
      if (detail?.type !== "pin-widget") return;
      if (!detail.ok) {
        setStatus("error");
        setMessage("The app couldn't set up the widget. Try again.");
      } else setStatus(detail.supported ? "asked" : "manual");
    }
    window.addEventListener("hidl-app", onAnswer);
    return () => window.removeEventListener("hidl-app", onAnswer);
  }, []);

  if (device === null) return null;

  const manualSteps = (
    <p className="mt-1 text-ink-soft">
      Press and hold your home screen, tap <strong>Widgets</strong>, and drag <strong>hidl</strong> onto the screen.
    </p>
  );

  if (device === "app") {
    if (!canPin) {
      return (
        <div className="space-y-3">
          <WidgetPreview title={title} />
          {manualSteps}
        </div>
      );
    }

    function pin() {
      setMessage(null);
      start(async () => {
        const res = await prepareAppWidget();
        if (!res.ok) {
          setStatus("error");
          setMessage(res.message);
          return;
        }
        // `theme` keeps older app versions (which only read the theme from messages) unchanged.
        window.ReactNativeWebView?.postMessage(
          JSON.stringify({ type: "pin-widget", feedUrl: res.feedUrl, theme: document.documentElement.dataset.theme ?? "teal" }),
        );
      });
    }

    const placed = widgets !== null && widgets > 0;
    return (
      <div className="space-y-4">
        <WidgetPreview title={title} />
        {status === "asked" ? (
          <p className="text-center font-semibold text-heading">Tap Add on the box that just opened.</p>
        ) : status === "manual" ? (
          <div>
            <p className="font-semibold text-heading">Almost there</p>
            {manualSteps}
          </div>
        ) : placed ? (
          <p className="flex items-center justify-center gap-2 rounded-control bg-mint px-3 py-3 font-semibold text-heading">
            <span aria-hidden>✓</span> It&apos;s on your home screen
          </p>
        ) : (
          <>
            <button type="button" onClick={pin} disabled={pending} className="btn btn-primary min-h-12 w-full text-base">
              {pending ? "Setting it up…" : "Add to home screen"}
            </button>
            {message && (
              <p role="alert" className="text-center text-sm text-wax">
                {message}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  if (device === "iphone") {
    return (
      <p className="rounded-2xl bg-mint p-4 text-ink-soft">
        Home-screen widgets need the hidl app, which is Android-only for now.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <WidgetPreview title={title} />
      {device === "android" ? (
        <a href={ANDROID_APP_PATH} className="btn btn-primary min-h-12 w-full text-base" download>
          Get the hidl app
        </a>
      ) : (
        <p className="text-center text-sm text-ink-soft">Open hidl on your Android phone to get the app.</p>
      )}
    </div>
  );
}

/**
 * A small picture of the widget, so the dialog shows what you get instead of explaining it.
 * Colors follow mobile/src/widget/CountdownWidget.tsx's Teal Paper look.
 */
function WidgetPreview({ title }: { title?: string }) {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-72 rounded-[1.75rem] p-3 shadow-lg"
      style={{ background: "linear-gradient(135deg, #2e7c7f, #63c1bb)" }}
    >
      <div className="flex items-center gap-1.5">
        <Mascot size={26} />
        <span className="font-brand text-lg font-bold text-[#ffffff]">hidl</span>
        <span className="ml-auto rounded-full bg-[rgba(255,255,255,0.22)] px-2.5 py-0.5 text-xs font-bold text-[#ffffff]">
          all your countdowns
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2.5 rounded-[1.1rem] bg-[#ffffff] px-2.5 py-2">
        <span className="grid size-10 place-items-center rounded-[0.9rem] bg-[#e2f0ee] text-xl">⏳</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-[#1b2a2c]">{title ?? "Your countdown"}</span>
          <span className="block text-xs text-[#5e6f72]">counts down right there</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-[rgba(255,255,255,0.35)]" />
    </div>
  );
}
