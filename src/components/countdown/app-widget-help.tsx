"use client";

import { useDevice } from "@/components/use-device";
import { ANDROID_APP_PATH } from "@/lib/android-app";

/**
 * The easy way to a home-screen widget: the hidl Android app (mobile/), which connects its widget
 * to the account's starred countdown by itself on sign-in. Feed tokens for KWGT stay available
 * underneath, as the advanced route.
 */
export function AppWidgetHelp({ title }: { title?: string }) {
  const device = useDevice();
  if (device === null) return null;
  const starHint = title ? (
    <>
      It shows your <strong>starred</strong> countdown, so star <strong>{title}</strong> to see it there.
    </>
  ) : (
    <>It shows your <strong>starred</strong> countdown.</>
  );

  if (device === "app") {
    return (
      <div className="rounded-2xl bg-mint p-4 text-ink-soft">
        <p className="font-semibold text-ocean">Add it from your home screen</p>
        <p className="mt-1">
          Press and hold an empty spot on your home screen, tap <strong>Widgets</strong>, find <strong>hidl</strong>,
          and drag <strong>hidl countdown</strong> onto the screen. {starHint}
        </p>
      </div>
    );
  }

  if (device === "iphone") {
    return (
      <p className="rounded-2xl bg-mint p-4 text-ink-soft">
        Home-screen widgets need the hidl app, which is Android-only for now. On iPhone, keep hidl on your home screen
        as a web app and your countdowns are one tap away.
      </p>
    );
  }

  return (
    <div className="rounded-2xl bg-mint p-4 text-ink-soft">
      <p className="font-semibold text-ocean">Get the hidl app for Android</p>
      <p className="mt-1">
        Install it, sign in with this account, then add the <strong>hidl countdown</strong> widget from your home
        screen. {starHint}
      </p>
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
