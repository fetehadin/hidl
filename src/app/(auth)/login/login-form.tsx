"use client";

import { useActionState } from "react";
import { type LoginState, sendMagicLink } from "@/actions/auth";

const initial: LoginState = { status: "idle" };

export function LoginForm() {
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  if (state.status === "sent") {
    return (
      <div role="status" className="space-y-2 text-center">
        <p className="font-display text-2xl">Check your inbox.</p>
        <p className="text-ink-soft">
          If that address belongs here, a sign-in link is on its way. Open it on this device, in this browser. It
          works once and expires in an hour.
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
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Send me a link"}
      </button>
    </form>
  );
}
