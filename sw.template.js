/* Recordatorio service worker. Generated at build time: the precache list is filled in by vite.config.ts. */
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const SHELL = `shell-${VERSION}`;
const RUNTIME = "runtime-v1";
const TILES = "tiles-v1";
const MAX_TILES = 1500;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") {
    cache.put(req, res.clone());
    if (max) trim(cacheName, max);
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // App pages (including share-target URLs with ?title=…): network first, offline falls back to the cached shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match("./index.html", { ignoreSearch: true })) || (await caches.match("./"))),
    );
    return;
  }
  if (url.hostname.endsWith("tile.openstreetmap.org")) {
    event.respondWith(cacheFirst(req, TILES, MAX_TILES));
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(req, RUNTIME));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req).then((hit) => hit || cacheFirst(req, RUNTIME)));
  }
  // Everything else (address search) goes straight to the network.
});
