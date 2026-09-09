/* Filled with the exact build manifest by scripts/build.ts. API responses are never cached here. */
const CACHE = "cubix-shell-__VERSION__";
const ASSETS = __ASSETS__;
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("cubix-shell-") && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/aaaaadmin") || url.pathname.startsWith("/admin/")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === "navigate") return await cache.match("/index.html") || fetch(event.request);
    return await cache.match(event.request, {ignoreSearch:true}) || fetch(event.request);
  })());
});
