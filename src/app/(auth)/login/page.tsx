import type { Metadata } from "next";
import { Analytics } from "@/components/analytics/analytics";
import Link from "next/link";
import { Mascot } from "@/components/mascot";
import { ClearPhotoCache } from "@/components/clear-photo-cache";
import { googleSignInEnabled } from "@/lib/auth-providers";
import { publicEnv } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in or sign up" };

const ERRORS: Record<string, string> = {
  "invalid-link": "That link looks incomplete. Request a new one.",
  "expired-link": "That link has expired or was already used. Request a new one.",
  "not-allowed": "This journal is private.",
  "google-cancelled": "Google sign-in was cancelled. Try again, or use your email instead.",
  "google-failed": "Couldn't sign in with Google just now. Try again, or use your email instead.",
  "other-browser":
    "Open the sign-in link in the same browser you requested it from. Request a new link here, then tap it on this device.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, deleted, mode } = await searchParams;
  // One email code (or Google) both creates an account and signs in, so the two tabs only change
  // the words. New visitors land on "Create account"; links for people who have one say ?mode=signin.
  const signingIn = mode === "signin";
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  const google = await googleSignInEnabled();

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <ClearPhotoCache />
      <Analytics signedOut />
      <div className="mb-8 flex flex-col items-center text-center">
        <Mascot mood="wave" size={128} label="Hidi, the Hidl mascot, waving hello" />
        <p className="eyebrow mt-3 mb-1">your journal</p>
        <h1 className="font-brand text-5xl font-semibold tracking-tight text-teal">Hidl</h1>
        <p className="mt-3 text-ink-soft">
          {signingIn ? "Welcome back. Your journal is waiting." : "Letters to future you, countdowns, and a year in pictures."}
        </p>
      </div>

      <div className="card p-6">
        <nav aria-label="Account" className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-paper-deep p-1">
          {[
            { label: "Create account", href: "/login", on: !signingIn },
            { label: "Sign in", href: "/login?mode=signin", on: signingIn },
          ].map((t) => (
            <Link
              key={t.label}
              href={t.href}
              replace
              aria-current={t.on ? "page" : undefined}
              className={`rounded-full px-3 py-2 text-center text-sm font-bold transition-colors ${
                t.on ? "bg-white text-ocean shadow-sm" : "text-ink-soft hover:text-ocean"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {deleted === "1" && (
          <p role="status" className="mb-4 rounded-control bg-accent-soft px-3 py-2 text-sm text-ink">
            Your account and everything in it has been deleted.
          </p>
        )}
        {message && (
          <p role="alert" className="mb-4 rounded-control bg-accent-soft px-3 py-2 text-sm text-ink">
            {message}
          </p>
        )}
        <LoginForm turnstileSiteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY} google={google} newAccount={!signingIn} />
      </div>
    </main>
  );
}
