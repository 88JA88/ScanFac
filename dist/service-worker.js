const CACHE_NAME = "scanfac-static-v2";
const APP_FILES = [
  "./", "./index.html", "./baremes.html", "./styles.css", "./overrides.css", "./baremes.css",
  "./app.js", "./baremes.js", "./baremes-defaut.js", "./manifest.webmanifest",
  "./assets/logo-ja.png", "./assets/logo-ja-192.png", "./assets/logo-ja-512.png"
];

self.addEventListener("install", event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("message", event => {
  if (event.data?.type !== "scanfac-refresh-cache") return;
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith("scanfac-static-")).map(key => caches.delete(key))))
    .then(() => event.ports[0]?.postMessage({ refreshed: true })));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); return response; })));
});
