"use client";

import { useEffect, useState } from "react";
import { PIN_MAX, PIN_MIN } from "@/lib/app-lock";

/**
 * A number pad. With `length` it submits as soon as that many digits are in (the lock screen);
 * without, it shows an OK button once PIN_MIN digits are in (choosing a new PIN). Typing on a
 * keyboard works too. `resetKey` clears it (after a wrong try).
 */
export function PinPad({
  length,
  onComplete,
  disabled = false,
  resetKey = 0,
  label,
}: {
  length?: number;
  onComplete: (pin: string) => void;
  disabled?: boolean;
  resetKey?: number;
  label: string;
}) {
  const [pin, setPin] = useState("");
  const [lastReset, setLastReset] = useState(resetKey);
  if (resetKey !== lastReset) {
    setLastReset(resetKey);
    setPin("");
  }
  const max = length ?? PIN_MAX;

  function press(d: string) {
    if (disabled || pin.length >= max) return;
    const next = pin + d;
    setPin(next);
    if (length && next.length === length) onComplete(next);
  }
  const back = () => !disabled && setPin(pin.slice(0, -1));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
      else if (e.key === "Enter" && !length && pin.length >= PIN_MIN) onComplete(pin);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex flex-col items-center gap-5">
      <div role="status" aria-label={`${label}: ${pin.length} digits entered`} className="flex h-5 items-center gap-3">
        {Array.from({ length: length ?? Math.max(PIN_MIN, pin.length) }, (_, i) => (
          <span key={i} className={`size-3.5 rounded-full border-2 border-teal transition-colors ${i < pin.length ? "bg-teal" : ""}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} onClick={() => press(d)} disabled={disabled}>{d}</Key>
        ))}
        {length ? <span /> : (
          <Key onClick={() => pin.length >= PIN_MIN && onComplete(pin)} disabled={disabled || pin.length < PIN_MIN} small>
            OK
          </Key>
        )}
        <Key onClick={() => press("0")} disabled={disabled}>0</Key>
        <Key onClick={back} disabled={disabled || pin.length === 0} small label="Delete the last digit">⌫</Key>
      </div>
    </div>
  );
}

function Key({ children, onClick, disabled, small, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; small?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`grid size-16 place-items-center rounded-full border-2 border-aqua bg-white font-display font-semibold text-heading shadow-[0_3px_0_var(--aqua)] transition-transform active:translate-y-[3px] active:shadow-none disabled:opacity-40 ${small ? "text-base" : "text-2xl"}`}
    >
      {children}
    </button>
  );
}
