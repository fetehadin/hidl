import type { Metadata } from "next";
import { Mascot } from "@/components/mascot";
import { publicEnv } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "invalid-link": "That link looks incomplete. Request a new one.",
  "expired-link": "That link has expired or was already used. Request a new one.",
  "not-allowed": "This journal is private.",
  "other-browser":
    "Open the sign-in link in the same browser you requested it from. Request a new link here, then tap it on this device.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, deleted } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Mascot mood="wave" size={128} label="Hidi, the hidl mascot, waving hello" />
        <p className="eyebrow mt-3 mb-1">senior year</p>
        <h1 className="font-display text-5xl font-semibold tracking-tight">hidl</h1>
        <p className="mt-3 text-ink-soft">Letters, a countdown, and a year in pictures.</p>
      </div>

      <div className="card p-6">
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
        <LoginForm turnstileSiteKey={publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
      </div>
    </main>
  );
}
