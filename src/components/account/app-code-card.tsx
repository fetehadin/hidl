"use client";

import { useEffect, useState, useTransition } from "react";
import { createAppCode } from "@/actions/app-handoff";

type Shown = { code: string; expiresAt: number };

/**
 * Account → "Sign in on the phone app": a one-time code to type into the app. This tab stays as
 * it is; the code works once, for 10 minutes, and a new one replaces it.
 */
export function AppCodeCard() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!shown) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [shown]);

  const left = shown ? Math.max(0, Math.round((shown.expiresAt - now) / 1000)) : 0;
  const expired = shown !== null && left === 0;

  function getCode() {
    setError(null);
    setCopied(false);
    start(async () => {
      const res = await createAppCode();
      if (res.ok) {
        setShown({ code: res.code, expiresAt: new Date(res.expiresAt).getTime() });
        setNow(Date.now());
      } else setError(res.message);
    });
  }

  async function copy() {
    if (!shown) return;
    try {
      await navigator.clipboard.writeText(shown.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      {shown && !expired ? (
        <div className="flex flex-wrap items-center gap-3">
          <output aria-live="polite" className="rounded-control bg-paper-deep px-4 py-2 font-mono text-2xl font-bold tracking-[0.2em] text-heading">
            {shown.code}
          </output>
          <button type="button" onClick={copy} className="btn btn-ghost">
            {copied ? "Copied" : "Copy"}
          </button>
          <p className="w-full text-sm text-muted tabular-nums">
            Works once · expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </p>
        </div>
      ) : (
        <>
          {expired && <p className="mb-3 text-sm text-muted">That code expired.</p>}
          <button type="button" onClick={getCode} disabled={pending} className="btn btn-primary">
            {pending ? "Making a code…" : expired ? "Get a new code" : "Get a code"}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-wax">
          {error}
        </p>
      )}
    </div>
  );
}
