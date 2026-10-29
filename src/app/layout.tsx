import type { Metadata, Viewport } from "next";
import { Caveat, Fraunces, Newsreader } from "next/font/google";
import { RegisterServiceWorker } from "@/components/register-service-worker";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
});

const body = Newsreader({
  variable: "--font-body",
  subsets: ["latin"],
});

const hand = Caveat({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: ["500", "600"],
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
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5ede0" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1613" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hand.variable} h-full`}>
      <body className="min-h-full antialiased text-[17px] leading-relaxed">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
