"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * One-tap install where the browser offers it (Chrome/Edge on Android and computers fire
 * `beforeinstallprompt`). Safari never does, so on iPhone this renders nothing and the
 * written steps do the job. Says so if hidl is already running as the installed app.
 */
export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [state, setState] = useState<"idle" | "installed" | "standalone">("idle");

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState("standalone");
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setState("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (state === "standalone") {
    return <p className="rounded-2xl bg-mint px-4 py-3 font-semibold text-ocean">You&apos;re already using the hidl app. 🎉</p>;
  }
  if (state === "installed") {
    return <p className="rounded-2xl bg-mint px-4 py-3 font-semibold text-ocean">Installed! Find hidl on your home screen.</p>;
  }
  if (!prompt) return null;
  return (
    <button
      type="button"
      className="btn btn-primary min-h-13 px-7 text-lg"
      onClick={async () => {
        await prompt.prompt();
        const { outcome } = await prompt.userChoice;
        if (outcome === "accepted") setState("installed");
        setPrompt(null);
      }}
    >
      Install hidl
    </button>
  );
}
