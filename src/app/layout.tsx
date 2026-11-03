import type { Metadata, Viewport } from "next";
import { Caveat, Fredoka, Newsreader, Nunito } from "next/font/google";
import { RegisterServiceWorker } from "@/components/register-service-worker";
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

export const viewport: Viewport = {
  // Light only, regardless of the OS preference.
  themeColor: "#c8e6e2",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hand.variable} ${letter.variable} h-full`}>
      <body className="min-h-full antialiased text-[17px] leading-relaxed">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
