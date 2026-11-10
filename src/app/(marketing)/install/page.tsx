import type { Metadata } from "next";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import Link from "next/link";
import { MascotSays } from "@/components/mascot";
import { InstallButton } from "@/components/marketing/install-button";
import { QrCode } from "@/components/marketing/qr-code";
import { publicEnv } from "@/lib/env";
import { ANDROID_APP_PATH } from "@/lib/android-app";

/**
 * "Get the app" help, public on every device. hidl is a web app you install from the browser
 * (src/app/manifest.ts + public/sw.js), so this explains how on each kind of device, starting
 * with the visitor's own, plus a one-tap button where the browser supports it.
 */
export const metadata: Metadata = {
  title: "Install the app",
  description: "Put hidl on your phone's home screen: steps for iPhone, Android and computers. No app store needed.",
  robots: { index: true, follow: true },
};

type Platform = "iphone" | "android" | "computer";

function detect(ua: ReturnType<typeof userAgent>): Platform {
  const os = ua.os.name?.toLowerCase() ?? "";
  if (os.includes("ios") || ua.device.model?.toLowerCase().includes("ipad")) return "iphone";
  if (os.includes("android")) return "android";
  return "computer";
}

export default async function InstallPage() {
  const ua = userAgent({ headers: await headers() });
  const platform = detect(ua);
  const order: Platform[] = [platform, ...(["iphone", "android", "computer"] as const).filter((p) => p !== platform)];
  const siteUrl = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

  return (
    <div className="mx-auto max-w-3xl pt-10">
      <p className="eyebrow mb-2">get the app</p>
      <h1 className="font-title text-4xl font-medium tracking-tight sm:text-5xl">Put hidl on your home screen</h1>
      <p className="mt-4 text-lg text-ink-soft">
        hidl installs straight from your web browser: no app store, no download to wait for. Once it&apos;s on your
        home screen it opens full screen with its own icon, just like any other app. You stay signed in.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <InstallButton />
        <MascotSays mood="wave" size={64}>
          {platform === "computer" ? "On a computer? Scan the code below with your phone." : "Takes about ten seconds!"}
        </MascotSays>
      </div>

      <div className="mt-10 space-y-5">
        {order.map((p) => (
          <Section key={p} platform={p} yours={p === platform} siteUrl={siteUrl} />
        ))}
      </div>

      <div className="card mt-8 p-6">
        <h2 className="font-display text-xl font-semibold">Good to know</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-soft">
          <li>It&apos;s the same hidl as the website, with the same account. Nothing extra to sign up for.</li>
          <li>Updates arrive by themselves: there&apos;s nothing to update in a store.</li>
          <li>
            To remove it, press and hold the icon and choose Remove (iPhone) or Uninstall (Android), like any other
            app. Your journal stays in your account.
          </li>
          <li>
            Don&apos;t see the option? Make sure you&apos;re in Safari on iPhone, or Chrome on Android, and not inside
            another app&apos;s built-in browser (like Instagram or WhatsApp). Open {siteUrl.replace(/^https?:\/\//, "")}{" "}
            directly in the browser instead.
          </li>
        </ul>
      </div>

      <p className="mt-10 text-center">
        <Link href="/login" className="btn btn-primary min-h-12 px-6">
          Sign in to hidl
        </Link>
      </p>
    </div>
  );
}

const SECTIONS: Record<Platform, { title: string; browser: string; steps: React.ReactNode[] }> = {
  iphone: {
    title: "iPhone and iPad",
    browser: "Safari",
    steps: [
      <>Open hidl in <strong>Safari</strong>.</>,
      <>Tap the <strong>Share</strong> button <ShareGlyph /> at the bottom of the screen (at the top on iPad).</>,
      <>Scroll down and tap <strong>Add to Home Screen</strong>. If you don&apos;t see it, tap <strong>Edit Actions</strong> to add it.</>,
      <>Tap <strong>Add</strong> in the top corner. hidl is now on your home screen.</>,
    ],
  },
  android: {
    title: "Android",
    browser: "Chrome",
    steps: [
      <>Open hidl in <strong>Chrome</strong>.</>,
      <>Tap the <strong>⋮</strong> menu in the top right corner.</>,
      <>Tap <strong>Install app</strong> (on some phones it&apos;s called <strong>Add to Home screen</strong>).</>,
      <>Tap <strong>Install</strong>. hidl appears on your home screen and in your app list.</>,
    ],
  },
  computer: {
    title: "Computer",
    browser: "Chrome or Edge",
    steps: [
      <>Open hidl in <strong>Chrome</strong> or <strong>Edge</strong>.</>,
      <>Click the <strong>install icon</strong> at the right end of the address bar (a screen with a down arrow).</>,
      <>Click <strong>Install</strong>. hidl opens in its own window and gets a spot in your apps.</>,
      <>Want it on your phone too? Scan the code with your phone&apos;s camera and follow the steps for your phone.</>,
    ],
  },
};

function Section({ platform, yours, siteUrl }: { platform: Platform; yours: boolean; siteUrl: string }) {
  const s = SECTIONS[platform];
  return (
    <section id={platform} className={`card scroll-mt-6 p-6 ${yours ? "ring-4 ring-aqua" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-semibold">{s.title}</h2>
        <span className="rounded-full bg-mint px-2.5 py-0.5 text-sm font-bold text-ocean">{s.browser}</span>
        {yours && <span className="rounded-full bg-teal px-2.5 py-0.5 text-sm font-bold text-accent-ink">Your device</span>}
      </div>
      <div className={platform === "computer" ? "mt-4 grid items-start gap-6 sm:grid-cols-[1fr_auto]" : "mt-4"}>
        <ol className="space-y-3">
          {s.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-ink-soft">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-teal font-display font-bold text-accent-ink">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
        {platform === "computer" && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-aqua bg-white p-3">
            <QrCode text={`${siteUrl}/install`} size={140} label="QR code that opens these instructions on your phone" />
            <span className="text-xs font-bold text-ocean">Scan with your phone</span>
          </div>
        )}
      </div>
      {platform === "android" && <AndroidApp />}
    </section>
  );
}

/** The native Android app (mobile/): same account, plus the countdown widget a web app can't have. */
function AndroidApp() {
  return (
    <div className="mt-5 rounded-2xl bg-mint p-4">
      <h3 className="font-display text-lg font-semibold text-ocean">Want a countdown widget? Get the Android app</h3>
      <p className="mt-1 text-ink-soft">
        The hidl app is the same journal and account, plus a home-screen widget that flips through your countdowns.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-ink-soft">
        <li>Download it below and open the downloaded file.</li>
        <li>
          If Android asks, allow your browser to <strong>install unknown apps</strong> (the app isn&apos;t in the Play
          Store yet), then tap <strong>Install</strong>.
        </li>
        <li>
          Sign in, then press and hold your home screen, tap <strong>Widgets</strong>, and add{" "}
          <strong>hidl countdown</strong>.
        </li>
      </ol>
      <a href={ANDROID_APP_PATH} className="btn btn-primary mt-4 min-h-11" download>
        Download the Android app
      </a>
    </div>
  );
}

/** iOS's share symbol: a box with an arrow pointing up. */
function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-label="(the square with an arrow pointing up)" role="img"
      className="inline -translate-y-0.5 text-ocean" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
