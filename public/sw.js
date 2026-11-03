// hidl's service worker. Three jobs:
//
// 1. Exist, so browsers offer a real home-screen install (one of the installability checks).
//    Pages themselves are never cached: every page is per-user and rendered fresh.
//
// 2. Keep photos on the device (not videos, see VIDEO_FILE). Photo files are immutable (a
//    replaced photo gets a brand new random path), but the app shows them through signed URLs whose token changes on every
//    page load, so the browser's normal HTTP cache never gets a hit and every visit re-downloaded
//    every photo. Here they're cached by path, ignoring the token: each photo is downloaded once.
//    The cache is wiped on the sign-in page (after sign-out or account deletion), see
//    src/components/clear-photo-cache.tsx.
//
// 3. Show a friendly offline page (public/offline.html) instead of the browser's error page
//    when a navigation fails with no connection. Pages still always come from the network;
//    navigation preload keeps that from being slowed down by the worker starting up.

const PHOTO_CACHE = "hidl-photos-v1";
const MAX_PHOTOS = 1500; // full images + thumbnails; oldest are dropped first
const SHELL_CACHE = "hidl-shell-v1";
const OFFLINE_URL = "/offline.html";
const SHELL_FILES = [OFFLINE_URL, "/email/hidi-wave.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      const current = [PHOTO_CACHE, SHELL_CACHE];
      await Promise.all(
        names.filter((n) => n.startsWith("hidl-") && !current.includes(n)).map((n) => caches.delete(n)),
      );
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

// Videos (calendar entries can be short videos) are left to the network: players fetch them
// with Range requests, which a cached whole-file response can't answer (Safari won't play it).
const VIDEO_FILE = /\.(mp4|webm|mov)$/i;

function isPhoto(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  return url.pathname.includes("/storage/v1/object/sign/photos/") && !VIDEO_FILE.test(url.pathname);
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_PHOTOS; i++) await cache.delete(keys[i]);
}

async function cachedPhoto(event) {
  const url = new URL(event.request.url);
  const key = url.origin + url.pathname;
  const cache = await caches.open(PHOTO_CACHE);
  const hit = await cache.match(key);
  if (hit) return hit;

  // Fetch with CORS (Storage allows it) so the response is readable and can be cached
  // without the large quota padding browsers apply to opaque responses.
  const response = await fetch(event.request.url, { mode: "cors", credentials: "omit" });
  if (response.ok) {
    event.waitUntil(cache.put(key, response.clone()).then(() => trim(cache)));
  }
  return response;
}

async function navigate(event) {
  try {
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
    return await fetch(event.request);
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    return offline ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(navigate(event));
    return;
  }
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && SHELL_FILES.includes(url.pathname)) {
    // The offline page and its picture: network first so they stay fresh, cache when offline.
    event.respondWith(fetch(event.request).catch(() => caches.match(url.pathname)));
    return;
  }
  if (!isPhoto(event.request)) return;
  event.respondWith(cachedPhoto(event).catch(() => fetch(event.request)));
});
