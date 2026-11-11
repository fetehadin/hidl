import type { Metadata, Viewport } from "next";
import { Caveat, Fredoka, Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import { cookies, headers } from "next/headers";
import { RegisterServiceWorker } from "@/components/register-service-worker";
import { THEME_COOKIE, THEME_INFO, parseTheme } from "@/lib/theme";
import "./globals.css";

// Plus Jakarta Sans for the interface, Newsreader for page titles and letters, and Fredoka only
// for the "hidl" wordmark. Caveat (the envelope's handwriting) loads on the pages that use it.
const body = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const letter = Newsreader({
  variable: "--font-letter",
  subsets: ["latin"],
});

const brand = Fredoka({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["600"],
});

const hand = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["500", "600"],
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Hidl", template: "%s · Hidl" },
  description: "Letters, a countdown, and a year in pictures.",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Hidl",
    // The normal status bar, colored live from theme-color (applyTheme updates it). With
    // "black-translucent" the clock was always white (unreadable in Teal Paper), and iPhones only
    // read this when the app starts, so switching themes left the bar mismatched.
    statusBarStyle: "default",
  },
  icons: {
    icon: { url: "/icon.svg", type: "image/svg+xml" },
    apple: "/apple-touch-icon.png",
  },
};

/** The browser's bar color and the form controls follow the chosen theme (not the OS preference). */
export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return { themeColor: THEME_INFO[theme].color, colorScheme: THEME_INFO[theme].scheme, viewportFit: "cover" };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  // Inside the phone app (its web view adds "hidl-app/" to the user agent, mobile/src/config.ts),
  // which keeps the page clear of the status and gesture bars itself: see --safe-top in globals.css.
  const inApp = (headerList.get("user-agent") ?? "").includes("hidl-app/");
  return (
    <html
      lang="en"
      data-theme={theme}
      data-app={inApp ? "" : undefined}
      className={`${body.variable} ${letter.variable} ${brand.variable} ${hand.variable} h-full`}
    >
      <body className="min-h-full antialiased text-[17px] leading-relaxed">
        <RegisterServiceWorker />
        <div aria-hidden className="status-bar-backdrop" />
        {children}
      </body>
    </html>
  );
}
