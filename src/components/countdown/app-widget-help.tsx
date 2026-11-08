"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { prepareAppWidget } from "@/actions/countdowns";
import { useDevice } from "@/components/use-device";
import { ANDROID_APP_PATH } from "@/lib/android-app";

// What the phone app tells this page (WebShell.tsx in mobile/): `window.hidlApp` before the page
// loads, and a "hidl-app" event with the answer to a request.
type HidlApp = { pinWidget?: boolean };
type PinResult = { type: "pin-widget"; ok: boolean; supported: boolean };

declare global {
  interface Window {
    hidlApp?: HidlApp;
    ReactNativeWebView?: { postMessage(message: string): void };
  }
}

const noSubscribe = () => () => {};
const appCanPin = () => Boolean(window.hidlApp?.pinWidget && window.ReactNativeWebView);

/**
 * The easy way to a home-screen widget: the hidl Android app, whose widget shows the starred
 * countdown. Inside the app it's one tap, like Duolingo's: star this countdown, hand the app a
 * fresh feed link, and Android asks "Add to Home screen?". Feed tokens for KWGT stay underneath,
 * as the advanced route (WidgetToken).
 */
export function AppWidgetHelp({ title, countdownId }: { title?: string; countdownId?: string }) {
  const device = useDevice();
  // Set by the app before the page's own scripts run, so it never changes afterwards.
  const canPin = useSyncExternalStore(noSubscribe, appCanPin, () => false);
  const [status, setStatus] = useState<"idle" | "asked" | "manual" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    function onAnswer(e: Event) {
      const detail = (e as CustomEvent<PinResult>).detail;
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
    <p className="mt-1">
      Press and hold an empty spot on your home screen, tap <strong>Widgets</strong>, find <strong>hidl</strong>, and drag{" "}
      <strong>hidl countdown</strong> onto the screen.
    </p>
  );

  if (device === "app") {
    if (!canPin) {
      return (
        <div className="rounded-2xl bg-mint p-4 text-ink-soft">
          <p className="font-semibold text-heading">Add it from your home screen</p>
          {manualSteps}
        </div>
      );
    }
    function pin() {
      setMessage(null);
      start(async () => {
        const res = await prepareAppWidget(countdownId ?? null);
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
    return (
      <div className="rounded-2xl bg-mint p-4 text-ink-soft">
        {status === "asked" ? (
          <>
            <p className="font-semibold text-heading">Tap Add on the box that just opened</p>
            <p className="mt-1">{title ? <><strong>{title}</strong> will be on your home screen.</> : "Your countdown will be on your home screen."}</p>
          </>
        ) : status === "manual" ? (
          <>
            <p className="font-semibold text-heading">Almost there</p>
            <p className="mt-1">Your home screen doesn&apos;t accept widgets from apps, so add it yourself:</p>
            {manualSteps}
          </>
        ) : (
          <>
            <p className="font-semibold text-heading">{title ? `Keep ${title} on your home screen` : "Keep it on your home screen"}</p>
            <p className="mt-1">One tap, and it counts down right there.</p>
            <button type="button" onClick={pin} disabled={pending} className="btn btn-primary mt-3 w-full">
              {pending ? "Setting it up…" : "Add to home screen"}
            </button>
            {message && (
              <p role="alert" className="mt-2 text-sm text-wax">
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
        Home-screen widgets need the hidl app, which is Android-only for now. On iPhone, keep hidl on your home screen as a
        web app and your countdowns are one tap away.
      </p>
    );
  }

  return (
    <div className="rounded-2xl bg-mint p-4 text-ink-soft">
      <p className="font-semibold text-heading">Get the hidl app for Android</p>
      <p className="mt-1">Sign in there, open this countdown, and tap <strong>Add to home screen</strong>.</p>
      {device === "android" ? (
        <a href={ANDROID_APP_PATH} className="btn btn-primary mt-3 min-h-11" download>
          Download the Android app
        </a>
      ) : (
        <p className="mt-2 text-sm">
          Open this page on your Android phone to download it, or go to <strong>/install</strong> there.
        </p>
      )}
    </div>
  );
}
