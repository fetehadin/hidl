import { requireOptionalNativeModule } from 'expo';

/**
 * Sharing a picture the page made (the memories board's "Share as a picture") through Android's
 * share sheet. A web view has no Web Share and no downloads, so the page hands the picture over
 * (base64) and the app saves it to its cache and shares the file.
 *
 * expo-sharing and expo-file-system are native: an over-the-air update can reach an older APK
 * that doesn't have them, where importing them would crash at startup. So they're only loaded
 * once their native side is known to be there; otherwise the page isn't told it can share.
 */
export const canShareImages =
  requireOptionalNativeModule('ExpoSharing') !== null && requireOptionalNativeModule('FileSystem') !== null;

/** Only names the page makes (hidl-memories-2026-11-10.jpg): nothing else lands in the cache. */
const NAME = /^hidl-[a-z0-9-]{1,60}\.jpg$/;
/** Base64 of a 2400px JPEG is well under this; anything bigger isn't from the page. */
const MAX_BASE64 = 24 * 1024 * 1024;

export async function shareImage(name: unknown, base64: unknown): Promise<boolean> {
  if (!canShareImages || typeof name !== 'string' || typeof base64 !== 'string') return false;
  if (!NAME.test(name) || base64.length > MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) return false;
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: 'base64' });
  await Sharing.shareAsync(file.uri, { mimeType: 'image/jpeg', dialogTitle: 'Share your memories' });
  return true;
}
