import { requireOptionalNativeModule } from 'expo';

/**
 * The Telegram-style photo picker behind the journal's "add a photo" (screens/MediaPickerSheet):
 * the phone's recent photos and videos in a grid, a camera tile, several picked at once. The page
 * asks for it ("pick-media"), and gets the chosen files back one by one ("picked-file").
 *
 * expo-media-library, expo-image-picker and expo-image-manipulator are native: an over-the-air
 * update can reach an older APK without them, where importing them would crash at startup. So
 * they're only loaded once their native side is known to be there; otherwise the page isn't told
 * it can pick here and keeps the browser's own file picker.
 */
export const canPickMedia =
  requireOptionalNativeModule('ExpoMediaLibrary') !== null &&
  requireOptionalNativeModule('ExponentImagePicker') !== null &&
  requireOptionalNativeModule('ExpoImageManipulator') !== null;

/* eslint-disable @typescript-eslint/no-require-imports */
const library = () => require('expo-media-library/legacy') as typeof import('expo-media-library/legacy');
const picker = () => require('expo-image-picker') as typeof import('expo-image-picker');
const manipulator = () => require('expo-image-manipulator') as typeof import('expo-image-manipulator');
const files = () => require('expo-file-system') as typeof import('expo-file-system');
/* eslint-enable @typescript-eslint/no-require-imports */

/** One photo or video on the phone (or just taken). */
export type PickedMedia = {
  id: string;
  uri: string;
  kind: 'photo' | 'video';
  width: number;
  height: number;
  /** Seconds, for videos. */
  duration: number;
};

export type Access = 'granted' | 'denied' | 'ask';

/** Whether the app may read the photos (all of them, or the ones the person chose on Android 14+). */
export async function photoAccess(ask: boolean): Promise<Access> {
  const MediaLibrary = library();
  const res = ask
    ? await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video'])
    : await MediaLibrary.getPermissionsAsync(false, ['photo', 'video']);
  if (res.granted || res.accessPrivileges === 'limited') return 'granted';
  return res.canAskAgain ? 'ask' : 'denied';
}

const PAGE = 60;

/** The newest photos and videos first, a page at a time. */
export async function loadRecent(after?: string): Promise<{ items: PickedMedia[]; next?: string }> {
  const MediaLibrary = library();
  const page = await MediaLibrary.getAssetsAsync({
    first: PAGE,
    after,
    mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
  });
  return {
    items: page.assets.map((a) => ({
      id: a.id,
      uri: a.uri,
      kind: a.mediaType === MediaLibrary.MediaType.video ? 'video' : 'photo',
      width: a.width,
      height: a.height,
      duration: a.duration,
    })),
    next: page.hasNextPage ? page.endCursor : undefined,
  };
}

function fromPicker(result: import('expo-image-picker').ImagePickerResult): PickedMedia[] {
  if (result.canceled) return [];
  return result.assets.map((a, i) => ({
    id: `${Date.now()}-${i}`,
    uri: a.uri,
    kind: a.type === 'video' ? 'video' : 'photo',
    width: a.width,
    height: a.height,
    duration: (a.duration ?? 0) / 1000,
  }));
}

/** Opens the camera; the photo taken, or nothing if the person backed out. */
export async function takePhoto(): Promise<PickedMedia[]> {
  const ImagePicker = picker();
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('camera');
  return fromPicker(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 }));
}

/** Android's own picker, for albums beyond the recent ones. */
export async function browseAll(multiple: boolean): Promise<PickedMedia[]> {
  return fromPicker(
    await picker().launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: multiple, quality: 1 }),
  );
}

/** Photos are sent to the page at most this big; the page shrinks them again for upload. */
const MAX_SIDE = 2400;
/** The page's own limit for one file (MAX_UPLOAD_BYTES in src/lib/media.ts). */
const MAX_VIDEO_BYTES = 5 * 1024 * 1024;

export type Prepared = { ok: true; name: string; mime: string; data: string } | { ok: false; message: string };

/** One picked item as base64 for the page: photos shrunk and turned into JPEG, videos as they are. */
export async function prepare(item: PickedMedia, index: number): Promise<Prepared> {
  const stamp = `${Date.now()}-${index}`;
  if (item.kind === 'video') {
    const { File } = files();
    const file = new File(item.uri);
    if ((file.size ?? 0) > MAX_VIDEO_BYTES) return { ok: false, message: 'A video was over 5 MB, so it was left out.' };
    const ext = item.uri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'mp4';
    const mime = ext === 'mov' ? 'video/quicktime' : ext === 'webm' ? 'video/webm' : 'video/mp4';
    return { ok: true, name: `hidl-${stamp}.${ext}`, mime, data: await file.base64() };
  }
  const { ImageManipulator, SaveFormat } = manipulator();
  const context = ImageManipulator.manipulate(item.uri);
  const longest = Math.max(item.width, item.height);
  if (longest > MAX_SIDE) {
    context.resize(item.width >= item.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
  if (!saved.base64) return { ok: false, message: "A photo couldn't be read." };
  return { ok: true, name: `hidl-${stamp}.jpg`, mime: 'image/jpeg', data: saved.base64 };
}
