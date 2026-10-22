/* Service worker: cache the app shell so the game works offline. Bump VERSION to force an update. */
const VERSION = "jw-v1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "css/style.css", "css/extra.css", "js/audio.js", "js/fx.js", "js/locales.js", "js/samples.js", "js/game.js", "js/intro.js", "js/browser-apis.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (so updates show up), fall back to cache when offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))),
  );
});
