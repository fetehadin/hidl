import { requireOptionalNativeModule } from 'expo';

/**
 * Sharing or saving a picture the page made (the memories "Share as a picture" sheet). A web view
 * has no Web Share and no downloads, so the page hands the picture over (base64) and the app
 * shares it through Android's share sheet, or saves it to a folder the person picks.
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

function valid(name: unknown, base64: unknown): name is string {
  return (
    canShareImages &&
    typeof name === 'string' &&
    typeof base64 === 'string' &&
    NAME.test(name) &&
    base64.length <= MAX_BASE64 &&
    /^[A-Za-z0-9+/=]+$/.test(base64)
  );
}

export async function shareImage(name: unknown, base64: unknown): Promise<boolean> {
  if (!valid(name, base64)) return false;
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(base64 as string, { encoding: 'base64' });
  await Sharing.shareAsync(file.uri, { mimeType: 'image/jpeg', dialogTitle: 'Share your memories' });
  return true;
}

export type SaveResult = { ok: boolean; cancelled?: boolean };

/**
 * "Download": Android asks where to save (its own folder picker, so the app needs no storage
 * permission), and the picture is written there. Picking nothing isn't a failure.
 */
export async function saveImage(name: unknown, base64: unknown): Promise<SaveResult> {
  if (!valid(name, base64)) return { ok: false };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Directory } = require('expo-file-system') as typeof import('expo-file-system');
  let folder: InstanceType<typeof Directory>;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch (error) {
    const text = `${(error as { code?: string })?.code ?? ''} ${(error as Error)?.message ?? ''}`;
    if (/cancel/i.test(text)) return { ok: false, cancelled: true };
    throw error;
  }
  const file = folder.createFile(name, 'image/jpeg');
  file.write(base64 as string, { encoding: 'base64' });
  return { ok: true };
}
