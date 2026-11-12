"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "@/actions/auth";
import { Mascot } from "@/components/mascot";
import { FingerprintIcon } from "@/components/letters/letter-key";
import { type LockConfig, checkLock, patternSecret, pinSecret, shouldLock, waitAfterFailures } from "@/lib/app-lock";
import { APP_BIOMETRIC_ID, checkAppBiometric } from "@/lib/app-biometric";
import { PasskeyError, checkLockPasskey } from "@/lib/passkey";
import { CONFIRM_LOCK_EVENT, type ConfirmLockDetail } from "./confirm-lock";
import { clearLock, markSeen, readLock, readSeen, writeLock } from "./lock-store";
import { PatternPad } from "./pattern-pad";
import { PinPad } from "./pin-pad";

/**
 * Wraps the signed-in app. When this device has a lock for this user, the app stays mounted but
 * hidden and inert behind the lock screen until the PIN or pattern is entered. `initiallyLocked`
 * comes from the server (the lock cookie), so a locked page is never painted, not even for a frame.
 *
 * It locks on a fresh start (a new tab or app launch) and when the app comes back after being in
 * the background longer than the chosen timeout. Reloading the page soon after doesn't lock again.
 */
export function AppLockGate({ userId, initiallyLocked, children }: { userId: string; initiallyLocked: boolean; children: ReactNode }) {
  const [locked, setLocked] = useState(initiallyLocked);
  const [config, setConfig] = useState<LockConfig | null>(null);
  /** Locked on request (confirmWithLock, e.g. before opening a letter): can be cancelled. */
  const asked = useRef<ConfirmLockDetail["resolve"] | null>(null);
  const [cancellable, setCancellable] = useState(false);

  // Decide on mount: storage only exists in the browser.
  useEffect(() => {
    const c = readLock(userId);
    if (!c) {
      // A cookie without a lock (storage cleared): drop the cookie and show the app.
      if (initiallyLocked) clearLock(userId);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
      setLocked(false);
      return;
    }
    setConfig(c);
    const now = Date.now();
    const lock = shouldLock(readSeen(userId), now, c.timeout);
    setLocked(lock);
    if (!lock) markSeen(userId, now);
  }, [userId, initiallyLocked]);

  // Lock again after being away too long. "Seen" is stamped when leaving, and checked on return.
  useEffect(() => {
    function onVisibility() {
      const c = readLock(userId);
      if (!c) return;
      if (document.visibilityState === "hidden") {
        if (!locked) markSeen(userId, Date.now());
      } else if (shouldLock(readSeen(userId), Date.now(), c.timeout)) {
        setConfig(c);
        setLocked(true);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onVisibility);
    };
  }, [userId, locked]);

  // Settings on /account turn the lock on or off in this same tab.
  useEffect(() => {
    function onChange() {
      const c = readLock(userId);
      setConfig(c);
      if (!c) setLocked(false);
      else markSeen(userId, Date.now());
    }
    window.addEventListener("hidl-lock-change", onChange);
    return () => window.removeEventListener("hidl-lock-change", onChange);
  }, [userId]);

  // Something private asks for the lock first (confirm-lock.ts).
  useEffect(() => {
    function onConfirm(e: Event) {
      const c = readLock(userId);
      if (!c) return; // no lock here: the asker goes ahead
      e.preventDefault();
      asked.current?.(false);
      asked.current = (e as CustomEvent<ConfirmLockDetail>).detail.resolve;
      setCancellable(true);
      setConfig(c);
      setLocked(true);
    }
    window.addEventListener(CONFIRM_LOCK_EVENT, onConfirm);
    return () => window.removeEventListener(CONFIRM_LOCK_EVENT, onConfirm);
  }, [userId]);

  const unlock = useCallback(() => {
    markSeen(userId, Date.now());
    setLocked(false);
    setCancellable(false);
    asked.current?.(true);
    asked.current = null;
  }, [userId]);

  const cancel = useCallback(() => {
    setLocked(false);
    setCancellable(false);
    asked.current?.(false);
    asked.current = null;
  }, []);

  return (
    <>
      {/* Hidden, not unmounted: what you were doing is still there after unlocking. */}
      <div inert={locked} aria-hidden={locked || undefined} style={locked ? { visibility: "hidden" } : undefined}>
        {children}
      </div>
      {/* Remounts once the config has loaded, so the wait state starts from what was stored. */}
      {locked && (
        <LockScreen
          key={config ? "ready" : "loading"}
          userId={userId}
          config={config}
          onUnlock={unlock}
          onCancel={cancellable ? cancel : undefined}
        />
      )}
    </>
  );
}

function LockScreen({
  userId,
  config,
  onUnlock,
  onCancel,
}: {
  userId: string;
  config: LockConfig | null;
  onUnlock: () => void;
  /** Only when the lock was asked for (opening a letter): back to where you were. */
  onCancel?: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [blockedUntil, setBlockedUntil] = useState(config?.blockedUntil ?? 0);
  const waitMs = Math.max(0, blockedUntil - now);
  const asked = useRef(false);

  async function tryPasskey() {
    const c = readLock(userId);
    if (!c?.passkeyId || checking) return;
    setChecking(true);
    try {
      const ok =
        c.passkeyId === APP_BIOMETRIC_ID ? (await checkAppBiometric("unlock")).ok : await checkLockPasskey(c.passkeyId);
      if (ok) {
        writeLock(userId, { ...c, failures: 0, blockedUntil: 0 });
        onUnlock();
        return;
      }
    } catch (e) {
      if (e instanceof PasskeyError && e.reason !== "cancelled") setMessage(e.message);
    }
    setChecking(false);
  }

  // Ask for the fingerprint straight away; the PIN or pattern stays on screen as the fallback.
  useEffect(() => {
    if (!config?.passkeyId || asked.current) return;
    asked.current = true;
    void tryPasskey();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the lock screen opens
  }, [config?.passkeyId]);

  // Tick while made to wait, so the countdown and the pad come back by themselves.
  useEffect(() => {
    if (waitMs <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waitMs]);

  async function attempt(secret: string) {
    const c = readLock(userId);
    if (!c || checking) return;
    if (c.blockedUntil > Date.now()) return;
    setChecking(true);
    const ok = await checkLock(c, secret);
    setChecking(false);
    if (ok) {
      writeLock(userId, { ...c, failures: 0, blockedUntil: 0 });
      onUnlock();
      return;
    }
    const failures = c.failures + 1;
    const until = Date.now() + waitAfterFailures(failures);
    writeLock(userId, { ...c, failures, blockedUntil: until });
    setBlockedUntil(until);
    setNow(Date.now());
    setWrong((w) => w + 1);
    setMessage(waitAfterFailures(failures) > 0 ? "Too many tries." : `That's not it. ${c.kind === "pin" ? "Try your PIN" : "Try your pattern"} again.`);
  }

  function forgot() {
    clearLock(userId);
    // Signing in again by email proves who you are; the lock is gone from this device either way.
    const form = document.getElementById("lock-sign-out") as HTMLFormElement | null;
    form?.requestSubmit();
  }

  const seconds = Math.ceil(waitMs / 1000);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lock-title"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 overflow-y-auto bg-paper px-6 py-10"
      style={{ paddingTop: "max(2.5rem, var(--safe-top))" }}
    >
      <Mascot mood="sleepy" size={84} float={false} />
      <div className="text-center">
        <h1 id="lock-title" className="font-title text-2xl font-medium">{onCancel ? "It's you, right?" : "Hidl is locked"}</h1>
        <p className="mt-1 text-sm text-ink-soft" aria-live="polite">
          {!config
            ? "One moment…"
            : waitMs > 0
              ? `Too many tries. Wait ${seconds} second${seconds === 1 ? "" : "s"}.`
              : message ?? (config.kind === "pin" ? "Enter your PIN" : "Draw your pattern")}
        </p>
      </div>

      {config?.kind === "pin" && (
        <PinPad length={config.length} onComplete={(pin) => attempt(pinSecret(pin))} disabled={checking || waitMs > 0} resetKey={wrong} label="PIN" />
      )}
      {config?.kind === "pattern" && (
        <PatternPad onComplete={(pts) => attempt(patternSecret(pts))} disabled={checking || waitMs > 0} resetKey={wrong} error={Boolean(message)} />
      )}

      {config?.passkeyId && (
        <button type="button" onClick={tryPasskey} disabled={checking}
          className="flex items-center gap-2 rounded-full bg-ice-soft px-4 py-2 font-bold text-ice">
          <FingerprintIcon className="size-6" />
          Use fingerprint or Face ID
        </button>
      )}

      <form id="lock-sign-out" action={signOut} />
      {onCancel ? (
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          Cancel
        </button>
      ) : (
        <>
          <button type="button" onClick={forgot} className="text-sm font-bold text-accent hover:underline">
            Forgot it? Sign out
          </button>
          <p className="max-w-xs text-center text-xs text-muted">Signing out removes the lock from this device. Sign back in with your email.</p>
        </>
      )}
    </div>
  );
}
