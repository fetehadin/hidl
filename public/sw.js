// Hidl's service worker. It makes Hidl work offline the way Telegram does: show what's already on
// the device, refresh it when the network answers, and let the person control the space it takes.
//
// 1. Exist, so browsers offer a real home-screen install (one of the installability checks).
//
// 2. Keep photos on the device (not videos, see VIDEO_FILE). Photo files are immutable (a
//    replaced photo gets a brand new random path), but the app shows them through signed URLs whose
//    token changes on every page load, so they're cached by path, ignoring the token: each photo is
//    downloaded once.
//
// 3. Keep a saved copy of the main pages (PAGE_PATHS: Today, Letters list, Countdown, Calendar,
//    Memories, Leaderboard), with their photo previews, and the app's own files (/_next/static), so
//    they open with no network. All of them are saved once the app has loaded online
//    (saveAllPages), not only the ones visited.
//    Pages always come from the network first; the saved copy is used only when the network fails
//    or takes longer than PAGE_TIMEOUT_MS. A served copy sets window.__hidlSavedAt, and
//    the page then refreshes itself once the network is back (src/components/offline-status.tsx).
//    Only pages marked <meta name="hidl-offline"> (the signed-in layout) are saved, never a letter
//    (/letters/<id>), Account or Admin.
//
// 4. Respect the person's storage settings (Account → Preferences → Storage on this phone,
//    src/components/account/storage-settings.tsx): how long unused photos stay, a space limit, and
//    whether full photos are saved on mobile data. The settings live in SETTINGS_CACHE.
//
// Photos and pages are wiped on the sign-in page (after sign-out or account deletion), see
// src/components/clear-photo-cache.tsx. The names and defaults below are mirrored in
// src/lib/offline-storage.ts: change both.

const PHOTO_CACHE = "hidl-photos-v2";
const PAGE_CACHE = "hidl-pages-v1";
const STATIC_CACHE = "hidl-static-v1";
const SHELL_CACHE = "hidl-shell-v1";
const SETTINGS_CACHE = "hidl-settings-v1";
const SETTINGS_KEY = "/__hidl/storage-settings";
const DEFAULTS = { keepDays: 30, maxMB: 100, fullOnMobile: false };

const MAX_STATIC = 600; // the app's own files; oldest dropped first
const PAGE_TIMEOUT_MS = 8000; // a page slower than this opens from its saved copy (if there is one)
const PAGE_REFRESH_MS = 15 * 60 * 1000; // a page's copy is re-saved at most this often
const RESTAMP_MS = 7 * 24 * 60 * 60 * 1000; // a photo seen again counts as new after this long
const PAGE_PATHS = ["/", "/letters", "/countdown", "/calendar", "/calendar/year", "/memories", "/leaderboard"];
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
      const current = [PHOTO_CACHE, PAGE_CACHE, STATIC_CACHE, SHELL_CACHE, SETTINGS_CACHE];
      await Promise.all(
        names.filter((n) => n.startsWith("hidl-") && !current.includes(n)).map((n) => caches.delete(n)),
      );
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
      await tidy();
    })(),
  );
});

// The storage page changed a setting: apply it (a shorter time or a smaller limit) right away.
self.addEventListener("message", (event) => {
  if (event.data?.type === "storage-settings") event.waitUntil(tidy());
  // The page has loaded online (offline-status.tsx): save every main page, Telegram-style.
  if (event.data?.type === "save-pages") event.waitUntil(saveAllPages());
});

async function settings() {
  try {
    const hit = await (await caches.open(SETTINGS_CACHE)).match(SETTINGS_KEY);
    return { ...DEFAULTS, ...(hit ? await hit.json() : {}) };
  } catch {
    return DEFAULTS;
  }
}

/** On mobile data (where the browser can tell), unless full photos were allowed there. */
function onMobileData() {
  const type = self.navigator.connection?.type;
  return type === "cellular";
}

/** A copy of a response with when it was saved and its size, for tidy(). */
async function stamped(response, saved = Date.now()) {
  const body = await response.blob();
  const headers = new Headers(response.headers);
  headers.set("x-hidl-saved", String(saved));
  headers.set("x-hidl-bytes", String(body.size));
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Drops photos and pages not used within the chosen time, then the oldest until the total fits
 * the space limit. Runs when the worker starts, after saving (at most once a minute) and when a
 * setting changes.
 */
let lastTidy = 0;
async function tidy() {
  lastTidy = Date.now();
  const s = await settings();
  const maxAge = s.keepDays > 0 ? s.keepDays * 86_400_000 : Infinity;
  const maxBytes = s.maxMB > 0 ? s.maxMB * 1024 * 1024 : Infinity;
  const now = Date.now();
  const kept = [];
  for (const name of [PHOTO_CACHE, PAGE_CACHE]) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      const saved = Number(response?.headers.get("x-hidl-saved")) || 0;
      if (now - saved > maxAge) await cache.delete(request);
      else kept.push({ cache, request, saved, bytes: Number(response?.headers.get("x-hidl-bytes")) || 0 });
    }
  }
  let total = kept.reduce((sum, k) => sum + k.bytes, 0);
  kept.sort((a, b) => a.saved - b.saved);
  for (const k of kept) {
    if (total <= maxBytes) break;
    await k.cache.delete(k.request);
    total -= k.bytes;
  }
}
function tidySoon(event) {
  if (Date.now() - lastTidy > 60_000) event.waitUntil(tidy());
}

// ---------------------------------------------------------------------------------------------
// Photos

// Videos (calendar entries can be short videos) are left to the network: players fetch them
// with Range requests, which a cached whole-file response can't answer (Safari won't play it).
const VIDEO_FILE = /\.(mp4|webm|mov)$/i;
const THUMB_FILE = /-thumb\.[a-z0-9]+$/i;

// Photo links: Supabase Storage's signed URLs, or the self-hosted store's (the `hidl-media`
// bucket at media.fetehadin.com, path-style; see docs/storage.md).
function isPhoto(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  const signed = url.pathname.includes("/storage/v1/object/sign/photos/") || url.pathname.startsWith("/hidl-media/");
  return signed && url.origin !== self.location.origin && !VIDEO_FILE.test(url.pathname);
}

async function cachedPhoto(event) {
  const url = new URL(event.request.url);
  const key = url.origin + url.pathname;
  const cache = await caches.open(PHOTO_CACHE);
  const hit = await cache.match(key);
  if (hit) {
    // Seen again: keep it as if new, so "not used for a month" means what it says.
    const saved = Number(hit.headers.get("x-hidl-saved")) || 0;
    if (Date.now() - saved > RESTAMP_MS) event.waitUntil(stamped(hit.clone()).then((r) => cache.put(key, r)));
    return hit;
  }

  // Fetch with CORS (Storage allows it) so the response is readable and can be cached
  // without the large quota padding browsers apply to opaque responses.
  const response = await fetch(event.request.url, { mode: "cors", credentials: "omit" });
  if (response.ok) {
    const s = await settings();
    // On mobile data, only previews are kept unless the person chose full photos too.
    const keep = THUMB_FILE.test(url.pathname) || s.fullOnMobile || !onMobileData();
    if (keep) {
      event.waitUntil(stamped(response.clone()).then((r) => cache.put(key, r)));
      tidySoon(event);
    }
  }
  return response;
}

// ---------------------------------------------------------------------------------------------
// Pages

function isSavablePage(url) {
  return url.origin === self.location.origin && PAGE_PATHS.includes(url.pathname);
}

/** "/calendar?m=2026-11": the page's own address, without Next's _rsc cache buster. */
function pageKey(url) {
  const u = new URL(url.pathname + url.search, self.location.origin);
  u.searchParams.delete("_rsc");
  return u.pathname + u.search;
}

async function savePage(url, response) {
  if (!response || !response.ok || response.type !== "basic" || response.redirected) return;
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return;
  const html = await response.text();
  // Only signed-in pages (the (app) layout sets this). Never the welcome or sign-in page.
  if (!html.includes('name="hidl-offline"')) return;
  const copy = new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  await (await caches.open(PAGE_CACHE)).put(pageKey(url), await stamped(copy));
  return html;
}

async function savedPage(url) {
  const cache = await caches.open(PAGE_CACHE);
  const hit = (await cache.match(pageKey(url))) ?? (await cache.match(url.pathname));
  if (!hit) return null;
  const saved = hit.headers.get("x-hidl-saved") ?? "0";
  // A flag the page reads (offline-status.tsx). A script, not a <meta>: React tidies <head> while
  // it hydrates and would remove an extra tag before the page could read it.
  const flag = `<script>window.__hidlSavedAt=${Number(saved) || 0}</script>`;
  const html = (await hit.text()).replace(/<head[^>]*>/, (head) => head + flag);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

async function navigate(event) {
  const url = new URL(event.request.url);
  const savable = isSavablePage(url);
  const network = (async () => (await event.preloadResponse) ?? (await fetch(event.request)))();
  try {
    if (!savable) return await network;
    let timer;
    const slow = new Promise((resolve) => (timer = setTimeout(() => resolve(null), PAGE_TIMEOUT_MS)));
    const first = await Promise.race([network, slow]);
    clearTimeout(timer);
    if (first) {
      event.waitUntil(savePage(url, first.clone()).catch(() => {}));
      return first;
    }
    // Slow network: show the saved copy now (it refreshes itself), and still save the fresh one.
    const copy = await savedPage(url);
    if (copy) {
      event.waitUntil(network.then((r) => savePage(url, r)).catch(() => {}));
      return copy;
    }
    return await network;
  } catch {
    if (savable) {
      const copy = await savedPage(url).catch(() => null);
      if (copy) return copy;
    }
    return (await caches.match(OFFLINE_URL)) ?? Response.error();
  }
}

// Moving between pages inside Hidl doesn't load whole pages (Next fetches just the changed part),
// so after such a move the page's saved copy is refreshed in the background, at most every
// PAGE_REFRESH_MS per page, and never when the browser is asked to save data.
const refreshing = new Set();
async function refreshSavedPage(url) {
  const key = pageKey(url);
  if (refreshing.has(key) || self.navigator.connection?.saveData) return;
  const hit = await (await caches.open(PAGE_CACHE)).match(key);
  if (hit && Date.now() - Number(hit.headers.get("x-hidl-saved")) < PAGE_REFRESH_MS) return;
  refreshing.add(key);
  try {
    const html = await savePage(url, await fetch(key, { credentials: "same-origin", headers: { accept: "text/html" } }));
    if (html) {
      await saveAppFiles(html);
      await savePreviews(html);
    }
  } catch {
    // Offline or failed: the old copy stays.
  } finally {
    refreshing.delete(key);
  }
}

/**
 * Saves every main page whose copy is older than SAVE_ALL_EVERY_MS, one after another, with the
 * photo previews on it, so each opens offline even if it wasn't visited (asked for by the page once
 * it has loaded online). At most one run every 10 minutes, so each page costs the server at most
 * one extra render an hour per person; never when the browser is asked to save data.
 */
const SAVE_ALL_EVERY_MS = 60 * 60 * 1000;
let lastSaveAll = 0;
async function saveAllPages() {
  if (Date.now() - lastSaveAll < 10 * 60 * 1000 || self.navigator.connection?.saveData) return;
  lastSaveAll = Date.now();
  const cache = await caches.open(PAGE_CACHE);
  for (const path of PAGE_PATHS) {
    const hit = await cache.match(path);
    if (hit && Date.now() - Number(hit.headers.get("x-hidl-saved")) < SAVE_ALL_EVERY_MS) continue;
    if (refreshing.has(path)) continue;
    refreshing.add(path);
    try {
      const url = new URL(path, self.location.origin);
      const html = await savePage(url, await fetch(path, { credentials: "same-origin", headers: { accept: "text/html" } }));
      if (html) {
        await saveAppFiles(html);
        await savePreviews(html);
      }
    } catch {
      return; // Offline again: try next time.
    } finally {
      refreshing.delete(path);
    }
  }
}

// The app's own files a saved page loads (its scripts, styles and fonts).
const APP_FILE_LINK = /\/_next\/static\/[^"'\s<>\\)]+/g;

/**
 * Keeps the scripts and styles a saved page needs. A page saved without being visited would
 * otherwise open offline as bare HTML that can't start (its code was never downloaded).
 */
async function saveAppFiles(html) {
  const cache = await caches.open(STATIC_CACHE);
  const paths = new Set([...html.matchAll(APP_FILE_LINK)].map((m) => m[0]));
  for (const path of paths) {
    if (await cache.match(path)) continue;
    try {
      const response = await fetch(path);
      if (response.ok && (response.headers.get("cache-control") ?? "").includes("immutable")) await cache.put(path, response);
    } catch {
      return;
    }
  }
}

// Photo previews in a saved page's HTML (img tags and the page data): signed links, valid for a
// while after the page was made, so they're fetched right away.
const THUMB_LINK = /https:\/\/[^"'\s<>]+?-thumb\.(?:webp|jpg)(?:\?[^"'\s<>]*)?/g;
const MAX_PREVIEWS_PER_PAGE = 150;

/** Keeps the photo previews a saved page shows, so its pictures appear offline too. */
async function savePreviews(html) {
  const cache = await caches.open(PHOTO_CACHE);
  const seen = new Set();
  let added = 0;
  for (const match of html.matchAll(THUMB_LINK)) {
    const raw = match[0].replace(/\\u0026/g, "&").replace(/&amp;/g, "&").replace(/\\+$/, "");
    let url;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    const key = url.origin + url.pathname;
    if (seen.has(key) || !isPhoto(new Request(url.href))) continue;
    seen.add(key);
    if (await cache.match(key)) continue;
    if (++added > MAX_PREVIEWS_PER_PAGE) break;
    try {
      const response = await fetch(url.href, { mode: "cors", credentials: "omit" });
      if (response.ok) await cache.put(key, await stamped(response));
    } catch {
      break;
    }
  }
  if (added > 0) await tidy();
}

/**
 * Page data for a move or a refresh inside Hidl (Next's RSC requests). When it fails, Next reloads
 * the whole page, and a saved copy that refreshes itself (a countdown that just finished, the
 * media link refresher) would then reload over and over while offline. So with no network the
 * request waits, retrying every few seconds, and answers once the network is back. The browser
 * gives up on it after a few minutes at most; the page then reloads once from its saved copy.
 */
async function pageData(request) {
  try {
    return await fetch(request);
  } catch {
    const giveUpAt = Date.now() + 4 * 60 * 1000;
    while (Date.now() < giveUpAt) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        return await fetch(request);
      } catch {
        // Still offline.
      }
    }
    return Response.error();
  }
}

// ---------------------------------------------------------------------------------------------
// The app's own files

/**
 * Next's built files (scripts, styles, fonts) have their content hash in the name and are sent as
 * "immutable", so a saved one is always right. Only those are kept: dev builds aren't immutable.
 */
async function staticFile(event) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const response = await fetch(event.request);
  if (response.ok && (response.headers.get("cache-control") ?? "").includes("immutable")) {
    event.waitUntil(
      cache.put(event.request, response.clone()).then(async () => {
        const keys = await cache.keys();
        for (let i = 0; i < keys.length - MAX_STATIC; i++) await cache.delete(keys[i]);
      }),
    );
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode === "navigate") {
    event.respondWith(navigate(event));
    return;
  }
  const url = new URL(request.url);
  if (url.origin === self.location.origin && request.method === "GET") {
    if (SHELL_FILES.includes(url.pathname)) {
      // The offline page and its picture: network first so they stay fresh, cache when offline.
      event.respondWith(fetch(request).catch(() => caches.match(url.pathname)));
      return;
    }
    if (url.pathname.startsWith("/_next/static/")) {
      event.respondWith(staticFile(event).catch(() => fetch(request)));
      return;
    }
    if (request.headers.get("rsc") === "1" && !request.headers.get("next-router-prefetch")) {
      // A move to one of the main pages: refresh its saved copy in the background.
      if (isSavablePage(url)) event.waitUntil(refreshSavedPage(url));
      event.respondWith(pageData(request));
    }
    return;
  }
  if (!isPhoto(request)) return;
  event.respondWith(cachedPhoto(event).catch(() => fetch(request)));
});
