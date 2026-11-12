// Fingerprint / Face ID inside the phone app. Android's web view has no passkeys, so the page asks
// the app (mobile/src/biometric.ts, via WebShell) to show the phone's own fingerprint prompt and
// waits for its "hidl-app" answer. Browser only.

/** Stored as the lock's passkeyId when the phone app's fingerprint opens the lock (no passkey). */
export const APP_BIOMETRIC_ID = "hidl-app-biometric";

type Answer = { type?: string; ok?: boolean; reason?: string };

function ask(message: Record<string, unknown>, type: string, timeoutMs: number): Promise<Answer | null> {
  const bridge = typeof window !== "undefined" ? window.ReactNativeWebView : undefined;
  if (!bridge || !window.hidlApp?.biometric) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (a: Answer | null) => {
      window.removeEventListener("hidl-app", onAnswer);
      clearTimeout(timer);
      resolve(a);
    };
    const onAnswer = (e: Event) => {
      const detail = (e as CustomEvent<Answer>).detail;
      if (detail?.type === type) done(detail);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    window.addEventListener("hidl-app", onAnswer);
    bridge.postMessage(JSON.stringify(message));
  });
}

/** The phone app can check a fingerprint here (and one is enrolled). */
export async function appBiometricAvailable() {
  return Boolean((await ask({ type: "biometric-available" }, "biometric-available", 3000))?.ok);
}

/** Shows the phone's fingerprint prompt. "cancelled" when the person chose the PIN or pattern. */
export async function checkAppBiometric(purpose: "setup" | "unlock"): Promise<{ ok: boolean; cancelled: boolean }> {
  const a = await ask({ type: "biometric-check", purpose }, "biometric-check", 120_000);
  return { ok: Boolean(a?.ok), cancelled: a?.reason === "cancelled" };
}
