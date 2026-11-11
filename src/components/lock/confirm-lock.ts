/**
 * Asks for this device's app lock (PIN, pattern or fingerprint) before something private, like
 * breaking a letter's seal. <AppLockGate> answers: it shows the lock screen with a Cancel button
 * and resolves true once unlocked, false if cancelled. With no lock on this device (or outside
 * the gate) it resolves true straight away.
 */
export const CONFIRM_LOCK_EVENT = "hidl-lock-confirm";

export type ConfirmLockDetail = { resolve: (ok: boolean) => void };

export function confirmWithLock(): Promise<boolean> {
  return new Promise((resolve) => {
    const event = new CustomEvent<ConfirmLockDetail>(CONFIRM_LOCK_EVENT, { detail: { resolve }, cancelable: true });
    // The gate calls preventDefault() when it takes the request.
    if (window.dispatchEvent(event)) resolve(true);
  });
}
