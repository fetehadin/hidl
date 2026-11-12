import { requireOptionalNativeModule } from 'expo';

/**
 * Fingerprint / Face ID for the page's app lock. Android's web view has no passkeys, so the page
 * asks the app instead (WebShell: "biometric-available", "biometric-check") and the app answers
 * with the phone's own fingerprint prompt.
 *
 * expo-local-authentication is native: an over-the-air update can reach an older APK without it,
 * where importing it would crash at startup. So it's only loaded once its native side is there.
 */
export const canBiometric = requireOptionalNativeModule('ExpoLocalAuthentication') !== null;

function auth() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-local-authentication') as typeof import('expo-local-authentication');
}

/** The phone has a fingerprint or face sensor and something enrolled in it. */
export async function biometricAvailable(): Promise<boolean> {
  if (!canBiometric) return false;
  const LocalAuth = auth();
  return (await LocalAuth.hasHardwareAsync()) && (await LocalAuth.isEnrolledAsync());
}

export type BiometricResult = { ok: true } | { ok: false; reason: 'cancelled' | 'unavailable' | 'failed' };

/** Shows the phone's fingerprint prompt. The page's PIN or pattern stays the fallback. */
export async function checkBiometric(purpose: unknown): Promise<BiometricResult> {
  if (!(await biometricAvailable().catch(() => false))) return { ok: false, reason: 'unavailable' };
  const result = await auth().authenticateAsync({
    promptMessage: purpose === 'setup' ? 'Turn on fingerprint unlock' : 'Unlock Hidl',
    cancelLabel: 'Use PIN or pattern',
    disableDeviceFallback: true,
  });
  if (result.success) return { ok: true };
  const cancelled = result.error === 'user_cancel' || result.error === 'system_cancel' || result.error === 'app_cancel';
  return { ok: false, reason: cancelled ? 'cancelled' : 'failed' };
}
