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
  /** The app places the size asked for (small, medium or large); older versions always place medium. */
  pinSizes?: boolean;
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
const appPinsSizes = () => Boolean(window.hidlApp?.pinSizes);

type WidgetSize = "small" | "medium" | "large";
const SIZES: { value: WidgetSize; label: string; cells: string }[] = [
  { value: "small", label: "Small", cells: "2×2" },
  { value: "medium", label: "Medium", cells: "4×2" },
  { value: "large", label: "Large", cells: "4×4" },
];
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
  const pinsSizes = useSyncExternalStore(subscribeApp, appPinsSizes, () => false);
  const [size, setSize] = useState<WidgetSize>("medium");
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
      Press and hold your home screen, tap <strong>Widgets</strong>, then <strong>Hidl</strong>: pick the size you
      like and drag it onto the screen.
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
          JSON.stringify({ type: "pin-widget", feedUrl: res.feedUrl, size, theme: document.documentElement.dataset.theme ?? "teal" }),
        );
      });
    }

    const placed = widgets !== null && widgets > 0;
    return (
      <div className="space-y-4">
        <WidgetPreview title={title} size={pinsSizes ? size : "medium"} />
        {pinsSizes && status !== "asked" && (
          <div role="radiogroup" aria-label="Widget size" className="grid grid-cols-3 gap-1 rounded-control bg-mint p-1">
            {SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={size === s.value}
                onClick={() => setSize(s.value)}
                className={`flex min-h-12 flex-col items-center justify-center rounded-[0.7rem] text-sm font-bold transition-colors ${
                  size === s.value ? "bg-card text-heading shadow-sm" : "text-ink-soft hover:text-heading"
                }`}
              >
                {s.label}
                <span className="text-xs font-semibold text-muted tabular-nums">{s.cells}</span>
              </button>
            ))}
          </div>
        )}
        {status === "asked" ? (
          <div className="text-center">
            <p className="font-semibold text-heading">Tap Add on the box that just opened.</p>
            {pinsSizes && (
              <button type="button" onClick={() => setStatus("idle")} className="mt-2 text-sm font-semibold text-accent">
                Add another size
              </button>
            )}
          </div>
        ) : status === "manual" ? (
          <div>
            <p className="font-semibold text-heading">Almost there</p>
            {manualSteps}
          </div>
        ) : (
          <>
            {placed && (
              <p className="flex items-center justify-center gap-2 text-sm font-semibold text-heading">
                <span aria-hidden>✓</span>
                {widgets === 1 ? "One Hidl widget is on your home screen" : `${widgets} Hidl widgets are on your home screen`}
              </p>
            )}
            {(!placed || pinsSizes) && (
              <button type="button" onClick={pin} disabled={pending} className="btn btn-primary min-h-12 w-full text-base">
                {pending ? "Setting it up…" : placed ? `Add a ${size} one` : "Add to home screen"}
              </button>
            )}
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

const CARD = { background: "linear-gradient(135deg, #3fa29e, #17636a)" };

/** The sliders button drawn on the widget. */
function Sliders({ size = 14 }: { size?: number }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[rgba(255,255,255,0.34)] bg-[rgba(255,255,255,0.16)] text-[#ffffff]">
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
        <circle cx="15" cy="7" r="2.2" />
        <circle cx="9" cy="17" r="2.2" />
      </svg>
    </span>
  );
}

function StackDots() {
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="h-3.5 w-1.5 rounded-full bg-[#ffffff]" />
      <span className="size-1.5 rounded-full bg-[rgba(255,255,255,0.38)]" />
      <span className="size-1.5 rounded-full bg-[rgba(255,255,255,0.38)]" />
    </span>
  );
}

function Bar({ className = "" }: { className?: string }) {
  return (
    <div className={`h-1.5 rounded-full bg-[rgba(255,255,255,0.24)] ${className}`}>
      <div className="h-full w-3/5 rounded-full bg-[#ffffff]" />
    </div>
  );
}

/**
 * A picture of the widget in the size picked, so the dialog shows what you get instead of
 * explaining it. Colors are the widget's own (mobile/src/widget/look.ts, light), not the page
 * theme's: it's a picture of something on the home screen. Cards peek out below the small and
 * medium ones to show they scroll.
 */
function WidgetPreview({ title, size = "medium" }: { title?: string; size?: WidgetSize }) {
  const name = title ?? "Your countdown";
  if (size === "small") {
    return (
      <div aria-hidden className="relative mx-auto w-44 pb-3">
        <div className="absolute inset-x-3 bottom-1 h-8 rounded-[1.5rem] bg-[#17636a] opacity-60" />
        <div className="relative flex aspect-square flex-col rounded-[1.6rem] p-3.5 text-[#ffffff] shadow-lg" style={CARD}>
          <div className="flex items-start">
            <span className="flex-1" />
            <Mascot brand size={52} float={false} />
            <span className="ml-1">
              <StackDots />
            </span>
          </div>
          <span className="mt-auto font-display text-4xl leading-none font-extrabold">5</span>
          <span className="mt-1 truncate text-sm font-extrabold">{name}</span>
          <span className="text-xs text-[rgba(255,255,255,0.82)]">days · 21h</span>
          <Bar className="mt-2" />
        </div>
      </div>
    );
  }
  if (size === "large") {
    return (
      <div aria-hidden className="mx-auto w-full max-w-80 rounded-[1.75rem] p-3 text-[#ffffff] shadow-lg" style={CARD}>
        <div className="flex items-center gap-1.5 px-1">
          <Mascot brand size={24} float={false} />
          <span className="font-brand text-lg font-semibold">Hidl</span>
          <span className="flex-1 text-xs text-[rgba(255,255,255,0.82)]">· 3 countdowns</span>
          <Sliders />
        </div>
        <div className="mt-2 rounded-[1.3rem] border border-[rgba(255,255,255,0.34)] p-3">
          <span className="rounded-full bg-[#ffffff] px-3 py-1 text-xs font-bold text-[#0f3f45]">5 days to go. Almost there!</span>
          <div className="mt-1 flex items-center">
            <div className="min-w-0 flex-1">
              <span className="font-display text-4xl leading-none font-extrabold">5</span>
              <span className="ml-1.5 text-sm font-extrabold">days</span>
              <span className="block truncate text-sm font-extrabold">{name}</span>
            </div>
            <Mascot brand size={56} float={false} />
          </div>
          <Bar className="mt-2" />
        </div>
        {["Trip", "Birthday"].map((t, i) => (
          <div key={t} className="mt-1.5 flex items-center rounded-[1rem] bg-[rgba(255,255,255,0.13)] px-3 py-2 text-sm font-extrabold">
            <span className="flex-1">{t}</span>
            <span className="text-lg">{i ? 53 : 30}</span>
            <span className="ml-1 text-xs text-[rgba(255,255,255,0.82)]">days</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-80 pb-3">
      <div className="absolute inset-x-6 bottom-0 h-8 rounded-[1.5rem] bg-[#17636a] opacity-40" />
      <div className="absolute inset-x-3 bottom-1.5 h-8 rounded-[1.6rem] bg-[#17636a] opacity-70" />
      <div className="relative rounded-[1.75rem] p-4 text-[#ffffff] shadow-lg" style={CARD}>
        <div className="flex items-center gap-2">
          <span className="truncate rounded-full bg-[#ffffff] px-3 py-1 text-xs font-bold text-[#0f3f45]">
            5 days to go. Almost there!
          </span>
          <span className="ml-auto">
            <Sliders />
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-5xl leading-none font-extrabold">5</span>
              <span className="leading-tight">
                <span className="block text-sm font-extrabold">days</span>
                <span className="block text-xs text-[rgba(255,255,255,0.82)]">21h</span>
              </span>
            </div>
            <span className="mt-1 block truncate text-base font-extrabold">{name}</span>
          </div>
          <Mascot brand size={64} float={false} />
          <StackDots />
        </div>
        <Bar className="mt-3" />
      </div>
    </div>
  );
}
