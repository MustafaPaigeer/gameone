// Minimal offline cache so the game is installable and playable without network.
const CACHE = "laststand-v1";
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
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
