"use client";

import Script from "next/script";
import { useActionState, useEffect, useRef, useState } from "react";
import { type LoginState, sendMagicLink } from "@/actions/auth";

const initial: LoginState = { status: "idle" };

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void },
      ) => void;
    };
  }
}

export function LoginForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, initial);
  const [captchaToken, setCaptchaToken] = useState("");
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scriptLoaded || !turnstileSiteKey || !widgetRef.current || !window.turnstile) return;
    window.turnstile.render(widgetRef.current, {
      sitekey: turnstileSiteKey,
      callback: setCaptchaToken,
    });
  }, [scriptLoaded, turnstileSiteKey]);

  if (state.status === "sent") {
    return (
      <div role="status" className="space-y-2 text-center">
        <p className="font-display text-2xl">Check your inbox.</p>
        <p className="text-ink-soft">
          If that address belongs here, a sign-in link is on its way. It works once, on any device, and expires in
          an hour.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-semibold text-ink-soft">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          className="field"
          placeholder="you@example.com"
          aria-invalid={state.status === "error"}
          aria-describedby={state.status === "error" ? "email-error" : undefined}
        />
        {state.status === "error" && (
          <p id="email-error" className="text-sm text-wax">
            {state.message}
          </p>
        )}
      </div>
      {turnstileSiteKey && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            onLoad={() => setScriptLoaded(true)}
          />
          <div ref={widgetRef} />
          <input type="hidden" name="captchaToken" value={captchaToken} />
        </>
      )}
      <button
        type="submit"
        className="btn btn-primary w-full"
        disabled={pending || (!!turnstileSiteKey && !captchaToken)}
      >
        {pending ? "Sending…" : "Send me a link"}
      </button>
    </form>
  );
}
