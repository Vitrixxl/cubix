/* Filled with the exact build manifest by scripts/build.ts. API responses are never cached here. */
const CACHE = "cubix-shell-__VERSION__";
const ASSETS = __ASSETS__;
const RUNTIME = "cubix-runtime-v1";
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    await caches.open(CACHE).then(cache => cache.addAll(ASSETS));
    // An old worker may serve the application shell at /aaaaadmin indefinitely.
    // Activate after the complete offline shell is ready, even with old tabs open.
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // Keep one previous build for assets still referenced by open application tabs.
    const previous = (await caches.keys()).filter(key => key.startsWith("cubix-shell-") && key !== CACHE);
    for (const key of previous.slice(0, -1)) await caches.delete(key);
    await self.clients.claim();
    // Repair only admin navigation intercepted by the old shell. Never reload an
    // active training session when the worker changes.
    for (const client of await self.clients.matchAll({ type: "window" })) {
      if (["/aaaaadmin", "/aaaaadmin/"].includes(new URL(client.url).pathname)) {
        // Do not await navigation inside activation: its fetch waits for this
        // activation event to finish.
        void client.navigate(client.url).catch(() => {});
      }
    }
  })());
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/aaaaadmin") || url.pathname.startsWith("/admin/")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === "navigate") {
      const path = url.pathname;
      const pages = ["/algorithms/", "/training/", "/community/", "/messages/", "/account/", "/guides/how-to-use-a-cube-timer/", "/guides/ao5-ao12/", "/guides/about-cubix/", "/guides/cube-algorithms/", "/guides/algorithm-training/"];
      const normalized = path.endsWith("/") ? path : path + "/";
      const offlinePage = path === "/" || path === "/index.html" ? "/" : pages.includes(normalized) ? normalized : undefined;
      if (!offlinePage) return fetch(event.request);
      // Ask the server first, including when a network exists but the server is
      // unreachable. Keep the cached HTML paired with its complete build assets.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(event.request, { cache: "no-cache", signal: controller.signal });
        if (response.status >= 500) return await cache.match(offlinePage) || response;
        return response;
      } catch (error) {
        const fallback = await cache.match(offlinePage);
        if (fallback) return fallback;
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
    const cached = await cache.match(event.request, {ignoreSearch:true}) || await caches.match(event.request, {ignoreSearch:true});
    if (cached) return cached;
    const response = await fetch(event.request);
    // Scramble generators and case diagrams are immutable per build: keep them after first use.
    if (response.ok && /^\/(vendor|cases)\//.test(url.pathname)) void caches.open(RUNTIME).then(runtime => runtime.put(event.request, response.clone())).catch(() => {});
    return response;
  })());
});
