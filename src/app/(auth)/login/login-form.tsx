"use client";

import Script from "next/script";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { type CodeState, type LoginState, sendMagicLink, signInWithGoogle, verifyEmailCode } from "@/actions/auth";

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

type Props = { turnstileSiteKey?: string; google?: boolean };

export function LoginForm(props: Props) {
  // "Use a different email" starts over with a fresh form (a new key resets its state).
  const [round, setRound] = useState(0);
  return <LoginFlow key={round} {...props} onRestart={() => setRound((r) => r + 1)} />;
}

function LoginFlow({ turnstileSiteKey, google = false, onRestart }: Props & { onRestart: () => void }) {
  const [state, action, pending] = useActionState(sendMagicLink, initial);
  const [, startResend] = useTransition();
  // Counts sends, so the code step's resend timer restarts after each one.
  const [sends, setSends] = useState(0);
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

  if (state.status === "sent" && state.email) {
    const email = state.email;
    return (
      <CodeStep
        key={sends}
        email={email}
        // With a captcha, every send needs a fresh check, so resending means starting over.
        onResend={
          turnstileSiteKey
            ? undefined
            : () =>
                startResend(() => {
                  const form = new FormData();
                  form.set("email", email);
                  setSends((n) => n + 1);
                  action(form);
                })
        }
        onRestart={onRestart}
      />
    );
  }

  return (
    <>
      {google && (
        <>
          <form action={signInWithGoogle}>
            <GoogleButton />
          </form>
          <div className="my-5 flex items-center gap-3 text-sm font-semibold text-muted" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            or use your email
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
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
            defaultValue={state.email}
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
          {pending ? "Sending…" : "Email me a sign-in code"}
        </button>
      </form>
    </>
  );
}

const RESEND_AFTER = 30; // seconds; Supabase's own minimum between two emails (max_frequency)

/**
 * After the email is sent: type the 6-digit code from it (or just tap its link). Resend once the
 * wait is over, and a way back if the address was mistyped, so nobody is stuck on "check your inbox".
 */
function CodeStep({ email, onResend, onRestart }: { email: string; onResend?: () => void; onRestart: () => void }) {
  const [state, verify, pending] = useActionState<CodeState, FormData>(verifyEmailCode, { status: "idle" });
  const [wait, setWait] = useState(RESEND_AFTER);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const t = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-5">
      <div role="status" className="space-y-1 text-center">
        <p className="font-display text-2xl text-heading">Check your inbox</p>
        <p className="text-ink-soft">
          We sent a code to <strong className="text-ink">{email}</strong>. Type it here, or tap the link in the email.
        </p>
      </div>
      <form ref={formRef} action={verify} className="space-y-3" noValidate>
        <input type="hidden" name="email" value={email} />
        <label htmlFor="code" className="sr-only">
          6-digit code
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus
          placeholder="123456"
          className="field text-center font-display text-2xl tracking-[0.4em]"
          aria-invalid={state.status === "error"}
          aria-describedby={state.status === "error" ? "code-error" : undefined}
          // Six digits typed or pasted: sign in straight away, no extra tap.
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
            if (digits !== e.target.value) e.target.value = digits;
            if (digits.length === 6 && !pending) formRef.current?.requestSubmit();
          }}
        />
        {state.status === "error" && (
          <p id="code-error" className="text-center text-sm text-wax">
            {state.message}
          </p>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div className="space-y-2 text-center text-sm text-ink-soft">
        <p>
          Nothing yet? Check spam or promotions.{" "}
          {onResend &&
            (wait > 0 ? (
              <span className="text-muted">Resend in {wait}s</span>
            ) : (
              <button type="button" onClick={onResend} className="font-semibold text-accent underline-offset-4 hover:underline">
                Send it again
              </button>
            ))}
        </p>
        <button type="button" onClick={onRestart} className="font-semibold text-accent underline-offset-4 hover:underline">
          Use a different email
        </button>
      </div>
    </div>
  );
}

/** Follows Google's sign-in branding: white button, the full-color "G", "Continue with Google". */
function GoogleButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex min-h-12 w-full items-center justify-center gap-3 rounded-control border-2 border-aqua bg-white px-4 text-[17px] font-bold text-ink shadow-[0_3px_0_var(--aqua)] transition-[transform,box-shadow,border-color] hover:border-teal active:translate-y-[3px] active:shadow-none disabled:opacity-70"
    >
      {pending ? (
        <span className="size-5 animate-spin rounded-full border-2 border-aqua border-t-teal" aria-hidden />
      ) : (
        <GoogleLogo />
      )}
      {pending ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
