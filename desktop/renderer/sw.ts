/// <reference lib="webworker" />
/** Offline shell of the web app, which the desktop app loads too. Online, every launch asks the server
 * for the page first, so it always opens the latest deployed version without any update step. */
const worker = self as unknown as ServiceWorkerGlobalScope;
declare const CUBIX_VERSION: string;
declare const CUBIX_PRECACHE: string[];
const SHELL = `cubix-shell-${CUBIX_VERSION}`;
const RUNTIME = "cubix-runtime-v1";

worker.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(CUBIX_PRECACHE.map((url) => new Request(url, { cache: "no-cache" })));
    await worker.skipWaiting();
  })());
});
worker.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // The previous shell stays for a page opened before this deployment, until the next one.
    const shells = (await caches.keys()).filter((key) => key.startsWith("cubix-shell-") && key !== SHELL);
    for (const key of shells.slice(0, -1)) await caches.delete(key);
    await worker.clients.claim();
  })());
});
async function page(request: Request) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 4000);
  try {
    const response = await fetch(request, { cache: "no-cache", signal: timeout.signal });
    if (response.ok) return response;
    return (await caches.match("/", { cacheName: SHELL })) ?? response;
  } catch (error) {
    const cached = await caches.match("/", { cacheName: SHELL }) ?? await caches.match("/");
    if (cached) return cached;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
async function asset(request: Request, url: URL) {
  const cached = await caches.match(request, { ignoreSearch: true });
  // Built bundles and vendor modules carry their version in their path; other files refresh in the background.
  const immutable = /^\/(build|vendor)\//.test(url.pathname);
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) await (await caches.open(RUNTIME)).put(request, response.clone());
    return response;
  });
  if (cached) {
    if (!immutable) refresh.catch(() => {});
    return cached;
  }
  return refresh;
}
worker.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== worker.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(event.request.mode === "navigate" ? page(event.request) : asset(event.request, url));
});
