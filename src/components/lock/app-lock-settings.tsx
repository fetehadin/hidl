"use client";

import { type ReactNode, useEffect, useState } from "react";
import {
  LOCK_TIMEOUTS,
  type LockConfig,
  type LockKind,
  type LockTimeout,
  checkLock,
  createLock,
  isValidPattern,
  isValidPin,
  patternSecret,
  pinSecret,
} from "@/lib/app-lock";
import { KeypadIcon, PatternIcon } from "@/components/icons";
import { FingerprintIcon } from "@/components/letters/letter-key";
import { APP_BIOMETRIC_ID, appBiometricAvailable, checkAppBiometric } from "@/lib/app-biometric";
import { PasskeyError, createLockPasskey, passkeysAvailable } from "@/lib/passkey";
import { clearLock, markSeen, readLock, writeLock } from "./lock-store";
import { PatternPad } from "./pattern-pad";
import { PinPad } from "./pin-pad";

type Step =
  | { name: "idle" }
  /** `withPasskey`: fingerprint was picked first, so this PIN or pattern is its backup. */
  | { name: "choose"; kind: LockKind; withPasskey?: boolean }
  | { name: "confirm"; kind: LockKind; secret: string; length: number; withPasskey?: boolean }
  | { name: "verify"; then: "off" | LockKind };

const announce = () => window.dispatchEvent(new Event("hidl-lock-change"));
const kindName = (k: LockKind) => (k === "pin" ? "PIN" : "pattern");

/**
 * The app lock on /account: PIN, pattern, or fingerprint / Face ID (always with a PIN or pattern
 * behind it, for when the sensor doesn't work), and how soon it locks again. Per device.
 */
export function AppLockSettings({ userId, email }: { userId: string; email: string }) {
  const [config, setConfig] = useState<LockConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [timeout, setTimeoutValue] = useState<LockTimeout>(60);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [canPasskey, setCanPasskey] = useState(false);
  // In the phone app the web view has no passkeys: the app's own fingerprint prompt stands in.
  const [viaApp, setViaApp] = useState(false);

  useEffect(() => {
    let live = true;
    appBiometricAvailable().then(async (app) => {
      if (!live) return;
      setViaApp(app);
      setCanPasskey(app || (await passkeysAvailable()));
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const c = readLock(userId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
    setConfig(c);
    if (c) setTimeoutValue(c.timeout);
    setReady(true);
  }, [userId]);

  function go(next: Step) {
    setMessage(null);
    setStep(next);
    setReset((r) => r + 1);
  }

  /** Adds fingerprint / Face ID to a lock (or takes it away). */
  async function setFingerprint(base: LockConfig, on: boolean) {
    let next: LockConfig = { ...base };
    if (on) {
      setBusy(true);
      try {
        if (viaApp) {
          const r = await checkAppBiometric("setup");
          if (!r.ok) throw r.cancelled ? new PasskeyError("cancelled", "") : new Error("Couldn't read your fingerprint. Try again.");
          next = { ...base, passkeyId: APP_BIOMETRIC_ID };
        } else {
          next = { ...base, passkeyId: await createLockPasskey({ id: userId, email }) };
        }
      } catch (e) {
        setBusy(false);
        if (!(e instanceof PasskeyError && e.reason === "cancelled")) {
          setMessage({ tone: "error", text: e instanceof Error ? e.message : "Couldn't turn it on." });
        }
        return false;
      }
      setBusy(false);
    } else {
      delete next.passkeyId;
    }
    writeLock(userId, next);
    setConfig(next);
    announce();
    return true;
  }

  function chose(kind: LockKind, secret: string, length: number) {
    if (step.name !== "choose") return;
    go({ name: "confirm", kind, secret, length, withPasskey: step.withPasskey });
  }

  async function confirmed(secret: string) {
    if (step.name !== "confirm") return;
    if (secret !== step.secret) {
      setMessage({ tone: "error", text: "They didn't match. Start again." });
      setStep({ name: "choose", kind: step.kind, withPasskey: step.withPasskey });
      setReset((r) => r + 1);
      return;
    }
    setBusy(true);
    const fresh = await createLock(step.kind, secret, step.length, timeout);
    // Changing the PIN or pattern keeps fingerprint / Face ID on.
    const c = config?.passkeyId ? { ...fresh, passkeyId: config.passkeyId } : fresh;
    setBusy(false);
    if (!writeLock(userId, c)) {
      setMessage({ tone: "error", text: "This browser won't let Hidl save a lock (private browsing?)." });
      return;
    }
    markSeen(userId, Date.now());
    setConfig(c);
    setStep({ name: "idle" });
    announce();
    if (step.withPasskey && (await setFingerprint(c, true))) {
      setMessage({ tone: "ok", text: `Fingerprint / Face ID is on, with your ${kindName(step.kind)} as a backup.` });
    } else if (!step.withPasskey) {
      setMessage({ tone: "ok", text: `${step.kind === "pin" ? "PIN" : "Pattern"} is on.` });
    }
  }

  async function verified(secret: string) {
    if (step.name !== "verify" || !config) return;
    setBusy(true);
    const ok = await checkLock(config, secret);
    setBusy(false);
    if (!ok) {
      setMessage({ tone: "error", text: "That's not it." });
      setReset((r) => r + 1);
      return;
    }
    if (step.then === "off") {
      clearLock(userId);
      setConfig(null);
      setStep({ name: "idle" });
      setMessage({ tone: "ok", text: "App lock is off on this device." });
      announce();
    } else {
      go({ name: "choose", kind: step.then });
    }
  }

  function pick(kind: LockKind) {
    // A new PIN or pattern (or switching between them) first needs the current one.
    go(config ? { name: "verify", then: kind } : { name: "choose", kind });
  }

  async function toggleFingerprint() {
    setMessage(null);
    if (!config) {
      go({ name: "choose", kind: "pin", withPasskey: true });
      return;
    }
    const on = !config.passkeyId;
    if (await setFingerprint(config, on)) {
      setMessage({ tone: "ok", text: on ? "Fingerprint / Face ID is on." : "Fingerprint / Face ID is off." });
    }
  }

  function changeTimeout(value: LockTimeout) {
    setTimeoutValue(value);
    if (config) {
      const next = { ...config, timeout: value };
      writeLock(userId, next);
      setConfig(next);
      announce();
    }
  }

  if (!ready) return <p className="text-sm text-muted">Checking this device…</p>;

  return (
    <div className="flex flex-col gap-4">
      {step.name === "idle" && (
        <div role="group" aria-label="Unlock with" className="grid grid-cols-3 gap-2">
          <Choice icon={<KeypadIcon className="size-6" />} label="PIN" on={config?.kind === "pin"} onClick={() => pick("pin")} />
          <Choice icon={<PatternIcon className="size-6" />} label="Pattern" on={config?.kind === "pattern"} onClick={() => pick("pattern")} />
          {canPasskey && (
            <Choice
              icon={<FingerprintIcon className="size-6" />}
              label="Fingerprint / Face ID"
              on={Boolean(config?.passkeyId)}
              onClick={toggleFingerprint}
              disabled={busy}
            />
          )}
        </div>
      )}

      {step.name !== "idle" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-line bg-white/70 p-5">
          <p className="text-center font-semibold" aria-live="polite">
            {step.name === "choose" &&
              (step.withPasskey
                ? "First, a backup PIN (4 to 6 digits)"
                : step.kind === "pin"
                  ? "Choose a PIN (4 to 6 digits)"
                  : "Draw a pattern joining at least 4 dots")}
            {step.name === "confirm" && `Enter the same ${kindName(step.kind)} again`}
            {step.name === "verify" && `Enter your current ${config ? kindName(config.kind) : "lock"}`}
          </p>

          {(() => {
            const kind = step.name === "verify" ? config!.kind : step.kind;
            const done =
              step.name === "choose"
                ? (s: string, len: number) => chose(kind, s, len)
                : step.name === "confirm"
                  ? (s: string) => confirmed(s)
                  : (s: string) => verified(s);
            const pinLength = step.name === "confirm" ? step.length : step.name === "verify" ? config!.length : undefined;
            return kind === "pin" ? (
              <PinPad
                key={`${step.name}-pin`}
                length={pinLength}
                label="PIN"
                resetKey={reset}
                disabled={busy}
                onComplete={(pin) => isValidPin(pin) && done(pinSecret(pin), pin.length)}
              />
            ) : (
              <PatternPad
                key={`${step.name}-pattern`}
                resetKey={reset}
                disabled={busy}
                onComplete={(pts) => isValidPattern(pts) && done(patternSecret(pts), pts.length)}
              />
            );
          })()}

          <button type="button" className="text-sm font-bold text-muted hover:text-ocean" onClick={() => go({ name: "idle" })}>
            Cancel
          </button>
        </div>
      )}

      {config && step.name === "idle" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-soft">
            Lock again
            <select value={timeout} onChange={(e) => changeTimeout(Number(e.target.value) as LockTimeout)} className="field w-auto py-1.5">
              {LOCK_TIMEOUTS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="text-sm font-bold text-wax hover:underline" onClick={() => go({ name: "verify", then: "off" })}>
            Turn off
          </button>
        </div>
      )}

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm font-semibold ${message.tone === "error" ? "text-wax" : "text-accent"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

function Choice({ icon, label, on, onClick, disabled }: { icon: ReactNode; label: string; on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-2 py-3 text-center text-sm font-bold transition-colors ${
        on ? "border-teal bg-mint text-ocean" : "border-line text-ink-soft hover:bg-mint/60"
      }`}
    >
      {icon}
      <span className="leading-tight">{label}</span>
      {on && <span className="text-[11px] font-extrabold tracking-wider text-accent uppercase">On</span>}
    </button>
  );
}
