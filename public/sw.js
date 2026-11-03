// HarnKan service worker: lets the app open with no connection.
//
// - Build assets (/_next/static) are immutable: cache first.
// - Pages and RSC payloads: network first, falling back to the last copy seen,
//   so a trip you have opened before still opens offline. Trip data itself
//   comes from IndexedDB in the page, not from here.
// - API routes and Supabase (another origin) are never cached.

const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.addAll(["/"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const c = await caches.open(PAGES);
      try {
        const res = await fetch(req);
        if (res.ok && res.type === "basic") c.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await c.match(req, { ignoreVary: true });
        if (hit) return hit;
        if (req.mode === "navigate") {
          const home = await c.match("/");
          if (home) return home;
        }
        throw err;
      }
    })(),
  );
});
