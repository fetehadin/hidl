import type { Metadata, Viewport } from "next";
import { Caveat, Fredoka, Newsreader, Nunito, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { RegisterServiceWorker } from "@/components/register-service-worker";
import { THEME_COOKIE, THEME_INFO, parseTheme } from "@/lib/theme";
import "./globals.css";

// Rounded, friendly faces for the UI; a book serif is kept only for reading letters.
const display = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
});

// Only used on some pages (reading a letter, the envelope's handwriting), so they aren't
// preloaded on every page: the browser fetches them the first time a page actually uses them.
const letter = Newsreader({
  variable: "--font-letter",
  subsets: ["latin"],
  preload: false,
});

// The blue theme's face (headings and text). Not preloaded: teal pages never ask for it.
const modern = Plus_Jakarta_Sans({
  variable: "--font-modern",
  subsets: ["latin"],
  preload: false,
});

const hand = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["500", "600"],
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "hidl", template: "%s · hidl" },
  description: "Letters, a countdown, and a year in pictures.",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "hidl",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: { url: "/icon.svg", type: "image/svg+xml" },
    apple: "/apple-touch-icon.png",
  },
};

/** The browser's bar color follows the chosen theme. Light only, regardless of the OS preference. */
export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return { themeColor: THEME_INFO[theme].color, colorScheme: "light", viewportFit: "cover" };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${display.variable} ${body.variable} ${modern.variable} ${hand.variable} ${letter.variable} h-full`}
    >
      <body className="min-h-full antialiased text-[17px] leading-relaxed">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
