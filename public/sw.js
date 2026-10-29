// Every page is per-user and dynamic, so this intentionally caches nothing — it exists
// only to satisfy "has a registered service worker", one of the installability checks
// some browsers use to offer a real home-screen install instead of a plain bookmark.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
