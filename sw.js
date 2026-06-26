// Service worker: keep the game installable + playable offline, but make sure
// users always get the latest deploy when they're online.
//
// Strategy = network-first for same-origin GETs: try the network, cache the
// fresh response, and fall back to cache only when offline. This avoids the
// classic "stale forever" trap of a cache-first worker. Bump VERSION on a
// deploy to also purge old caches on activate.
const VERSION = "v5";
const CACHE = `laststand-${VERSION}`;
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./manifest.webmanifest",
  "./icon.svg",
  "./js/main.js",
  "./js/game.js",
  "./js/ui.js",
  "./js/input.js",
  "./js/entities.js",
  "./js/levels.js",
  "./js/weapons.js",
  "./js/audio.js",
  "./js/haptics.js",
];

self.addEventListener("install", (e) => {
  // Activate the new worker immediately instead of waiting for old tabs to close.
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        // Refresh the cache with the latest copy for offline use.
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() =>
        // Offline: serve cache, falling back to the app shell for navigations.
        caches.match(req).then((hit) => hit || caches.match("./index.html"))
      )
  );
});
