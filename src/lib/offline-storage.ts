// What Hidl keeps on this device for offline use (photos and saved pages, kept by public/sw.js),
// and the person's settings for it. Browser only. The cache names and defaults mirror public/sw.js:
// change both.

export const PHOTO_CACHE_PREFIX = "hidl-photos-";
export const PAGE_CACHE_PREFIX = "hidl-pages-";
const SETTINGS_CACHE = "hidl-settings-v1";
const SETTINGS_KEY = "/__hidl/storage-settings";

export type StorageSettings = {
  /** Photos and pages not used for this many days are removed; 0 = keep them. */
  keepDays: number;
  /** Space limit in MB; the oldest go first when it's reached. */
  maxMB: number;
  /** Also keep full photos (not just previews) when on mobile data. */
  fullOnMobile: boolean;
};

export const DEFAULT_STORAGE: StorageSettings = { keepDays: 30, maxMB: 100, fullOnMobile: false };

export const KEEP_OPTIONS = [
  { value: 7, label: "1 week" },
  { value: 30, label: "1 month" },
  { value: 0, label: "Forever" },
] as const;

export const LIMIT_OPTIONS = [
  { value: 100, label: "100 MB" },
  { value: 500, label: "500 MB" },
  { value: 2000, label: "2 GB" },
] as const;

const supported = () => typeof window !== "undefined" && "caches" in window;

export async function readStorageSettings(): Promise<StorageSettings> {
  if (!supported()) return DEFAULT_STORAGE;
  try {
    const hit = await (await caches.open(SETTINGS_CACHE)).match(SETTINGS_KEY);
    return { ...DEFAULT_STORAGE, ...(hit ? ((await hit.json()) as Partial<StorageSettings>) : {}) };
  } catch {
    return DEFAULT_STORAGE;
  }
}

/** Saves the settings where the service worker reads them, and tells it to apply them now. */
export async function writeStorageSettings(s: StorageSettings) {
  if (!supported()) return;
  const body = JSON.stringify(s);
  await (await caches.open(SETTINGS_CACHE)).put(SETTINGS_KEY, new Response(body, { headers: { "content-type": "application/json" } }));
  navigator.serviceWorker?.controller?.postMessage({ type: "storage-settings" });
}

async function savedCaches() {
  const names = await caches.keys();
  return names.filter((n) => n.startsWith(PHOTO_CACHE_PREFIX) || n.startsWith(PAGE_CACHE_PREFIX));
}

/** Space used by saved photos and pages, in bytes (each saved file records its size). */
export async function savedBytes(): Promise<number> {
  if (!supported()) return 0;
  let total = 0;
  for (const name of await savedCaches()) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      total += Number(response?.headers.get("x-hidl-bytes")) || 0;
    }
  }
  return total;
}

/** Removes every saved photo and page from this device. Everything stays safe on the server. */
export async function clearSaved() {
  if (!supported()) return;
  await Promise.all((await savedCaches()).map((n) => caches.delete(n)));
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
