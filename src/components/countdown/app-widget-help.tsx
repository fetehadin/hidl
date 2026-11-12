"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { prepareAppWidget } from "@/actions/countdowns";
import { Mascot } from "@/components/mascot";
import { useDevice } from "@/components/use-device";
import { ANDROID_APP_PATH } from "@/lib/android-app";

// What the phone app tells this page (WebShell.tsx in mobile/): `window.hidlApp` before the page
// loads, then "hidl-app" events: how many hidl widgets are on the home screen, and pin answers.
// `shareImage` / `saveImage` / `copyImage`: the app can share, save to a folder, or copy a picture
// the page made (the share sheets).
type HidlApp = {
  pinWidget?: boolean;
  widgets?: number | null;
  shareImage?: boolean;
  saveImage?: boolean;
  copyImage?: boolean;
  /** The app can show the phone's fingerprint prompt (src/lib/app-biometric.ts). */
  biometric?: boolean;
};
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
      Press and hold your home screen, tap <strong>Widgets</strong>, and drag <strong>Hidl</strong> onto the screen.
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
        Widgets come with the Android app. On iPhone, keep Hidl one tap away: in Safari, tap{" "}
        <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <WidgetPreview title={title} />
      {device === "android" ? (
        <a href={ANDROID_APP_PATH} className="btn btn-primary min-h-12 w-full text-base" download>
          Get the Hidl app
        </a>
      ) : (
        <p className="text-center text-sm text-ink-soft">Open Hidl on your Android phone to get the app.</p>
      )}
    </div>
  );
}

/**
 * A small picture of the widget, so the dialog shows what you get instead of explaining it.
 * Colors are the widget's own (mobile/src/widget/look.ts, light), not the page theme's: it's a
 * picture of something on the home screen. Two cards peek out below to show it scrolls.
 */
function WidgetPreview({ title }: { title?: string }) {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-80 pb-3">
      <div className="absolute inset-x-6 bottom-0 h-8 rounded-[1.5rem] bg-[#17636a] opacity-40" />
      <div className="absolute inset-x-3 bottom-1.5 h-8 rounded-[1.6rem] bg-[#17636a] opacity-70" />
      <div
        className="relative rounded-[1.75rem] p-4 shadow-lg"
        style={{ background: "linear-gradient(135deg, #3fa29e, #17636a)" }}
      >
        <div className="flex items-center gap-2">
          <span className="truncate rounded-full bg-[#ffffff] px-3 py-1 text-xs font-bold text-[#0f3f45]">
            5 days to go. Almost there!
          </span>
          <span className="ml-auto grid size-7 shrink-0 place-items-center rounded-full border border-[rgba(255,255,255,0.34)] bg-[rgba(255,255,255,0.16)] text-[#ffffff]">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
              <circle cx="15" cy="7" r="2.2" />
              <circle cx="9" cy="17" r="2.2" />
            </svg>
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="min-w-0 flex-1 text-[#ffffff]">
            <div className="flex items-center gap-2">
              <span className="font-display text-5xl leading-none font-extrabold">5</span>
              <span className="leading-tight">
                <span className="block text-sm font-extrabold">days</span>
                <span className="block text-xs text-[rgba(255,255,255,0.82)]">21h</span>
              </span>
            </div>
            <span className="mt-1 block truncate text-base font-extrabold">{title ?? "Your countdown"}</span>
          </div>
          <Mascot brand size={64} float={false} />
          <span className="flex flex-col items-center gap-1">
            <span className="h-3.5 w-1.5 rounded-full bg-[#ffffff]" />
            <span className="size-1.5 rounded-full bg-[rgba(255,255,255,0.38)]" />
            <span className="size-1.5 rounded-full bg-[rgba(255,255,255,0.38)]" />
          </span>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-[rgba(255,255,255,0.24)]">
          <div className="h-full w-3/5 rounded-full bg-[#ffffff]" />
        </div>
      </div>
    </div>
  );
}
