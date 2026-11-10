"use client";

import { useEffect, useState } from "react";
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
import { FingerprintIcon } from "@/components/letters/letter-key";
import { PasskeyError, createLockPasskey, passkeysAvailable } from "@/lib/passkey";
import { clearLock, markSeen, readLock, writeLock } from "./lock-store";
import { PatternPad } from "./pattern-pad";
import { PinPad } from "./pin-pad";

type Step =
  | { name: "idle" }
  | { name: "choose"; kind: LockKind }
  | { name: "confirm"; kind: LockKind; secret: string; length: number }
  | { name: "verify"; then: "off" | "change" };

const announce = () => window.dispatchEvent(new Event("hidl-lock-change"));

/** Turn the device lock on or off, pick PIN or pattern, and how soon it locks again. On /account. */
export function AppLockSettings({ userId, email }: { userId: string; email: string }) {
  const [config, setConfig] = useState<LockConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [timeout, setTimeoutValue] = useState<LockTimeout>(60);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [canPasskey, setCanPasskey] = useState(false);

  useEffect(() => {
    let live = true;
    passkeysAvailable().then((ok) => live && setCanPasskey(ok));
    return () => {
      live = false;
    };
  }, []);

  async function setFingerprint(on: boolean) {
    if (!config) return;
    setMessage(null);
    let next: LockConfig = { ...config };
    if (on) {
      setBusy(true);
      try {
        next = { ...config, passkeyId: await createLockPasskey({ id: userId, email }) };
      } catch (e) {
        setBusy(false);
        if (!(e instanceof PasskeyError && e.reason === "cancelled")) {
          setMessage({ tone: "error", text: e instanceof Error ? e.message : "Couldn't turn it on." });
        }
        return;
      }
      setBusy(false);
    } else {
      delete next.passkeyId;
    }
    writeLock(userId, next);
    setConfig(next);
    setMessage({ tone: "ok", text: on ? "Fingerprint / Face ID opens hidl now. Your " + kindName(config.kind) + " still works too." : "Fingerprint / Face ID is off for the lock." });
    announce();
  }

  useEffect(() => {
    const c = readLock(userId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
    setConfig(c);
    if (c) setTimeoutValue(c.timeout);
    setReady(true);
  }, [userId]);

  function chose(kind: LockKind, secret: string, length: number) {
    setMessage(null);
    setStep({ name: "confirm", kind, secret, length });
    setReset((r) => r + 1);
  }

  async function confirmed(secret: string) {
    if (step.name !== "confirm") return;
    if (secret !== step.secret) {
      setMessage({ tone: "error", text: "They didn't match. Start again." });
      setStep({ name: "choose", kind: step.kind });
      setReset((r) => r + 1);
      return;
    }
    setBusy(true);
    const fresh = await createLock(step.kind, secret, step.length, timeout);
    // Changing the PIN or pattern keeps fingerprint / Face ID on.
    const c = config?.passkeyId ? { ...fresh, passkeyId: config.passkeyId } : fresh;
    setBusy(false);
    if (!writeLock(userId, c)) {
      setMessage({ tone: "error", text: "This browser won't let hidl save a lock (private browsing?)." });
      return;
    }
    markSeen(userId, Date.now());
    setConfig(c);
    setStep({ name: "idle" });
    setMessage({ tone: "ok", text: `Lock is on. hidl will ask for your ${step.kind === "pin" ? "PIN" : "pattern"} on this device.` });
    announce();
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
      setMessage({ tone: "ok", text: "Lock is off on this device." });
      announce();
    } else {
      setMessage(null);
      setStep({ name: "choose", kind: config.kind });
      setReset((r) => r + 1);
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

  const kindName = (k: LockKind) => (k === "pin" ? "PIN" : "pattern");

  return (
    <div className="flex flex-col gap-4">
      {step.name === "idle" && (
        <>
          <p className="font-semibold">
            {config ? `On, with a ${kindName(config.kind)}.` : "Off on this device."}
          </p>
          <div className="flex flex-wrap gap-2">
            {config ? (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => { setMessage(null); setStep({ name: "verify", then: "change" }); }}>
                  Change
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => { setMessage(null); setStep({ name: "verify", then: "off" }); }}>
                  Turn off
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => { setMessage(null); setStep({ name: "choose", kind: "pin" }); }}>
                  Use a PIN
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => { setMessage(null); setStep({ name: "choose", kind: "pattern" }); }}>
                  Use a pattern
                </button>
              </>
            )}
          </div>
          {config && canPasskey && (
            <div className="flex items-center gap-3 rounded-2xl bg-ice-soft px-4 py-3">
              <FingerprintIcon className="size-7 shrink-0 text-ice" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">Fingerprint / Face ID</span>
                <span className="block text-sm text-ink-soft">{config.passkeyId ? "On, with your " + kindName(config.kind) + " as a backup" : "Unlock with a touch or a look"}</span>
              </span>
              <button type="button" disabled={busy} onClick={() => setFingerprint(!config.passkeyId)}
                className="shrink-0 rounded-control px-3 py-2 text-sm font-bold text-accent hover:bg-mint">
                {config.passkeyId ? "Turn off" : "Turn on"}
              </button>
            </div>
          )}
        </>
      )}

      {step.name !== "idle" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-line bg-white/70 p-5">
          <p className="text-center font-semibold" aria-live="polite">
            {step.name === "choose" && (step.kind === "pin" ? "Choose a PIN (4 to 6 digits)" : "Draw a pattern joining at least 4 dots")}
            {step.name === "confirm" && `Enter the same ${kindName(step.kind)} again`}
            {step.name === "verify" && `Enter your current ${config ? kindName(config.kind) : "lock"}`}
          </p>
          {step.name === "choose" && (
            <div className="flex gap-1.5 text-sm">
              {(["pin", "pattern"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStep({ name: "choose", kind: k })}
                  className={`rounded-full border-2 px-3 py-1 font-bold ${step.kind === k ? "border-teal bg-mint text-ocean" : "border-line text-muted"}`}
                >
                  {k === "pin" ? "PIN" : "Pattern"}
                </button>
              ))}
            </div>
          )}

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

          <button type="button" className="text-sm font-bold text-muted hover:text-ocean" onClick={() => { setStep({ name: "idle" }); setMessage(null); }}>
            Cancel
          </button>
        </div>
      )}

      <div>
        <label htmlFor="lock-timeout" className="mb-1.5 block text-sm font-semibold text-ink-soft">Lock again</label>
        <select id="lock-timeout" value={timeout} onChange={(e) => changeTimeout(Number(e.target.value) as LockTimeout)} className="field max-w-xs py-2">
          {LOCK_TIMEOUTS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm font-semibold ${message.tone === "error" ? "text-wax" : "text-accent"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
