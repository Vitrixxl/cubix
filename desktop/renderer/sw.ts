/// <reference lib="webworker" />
/** Offline shell of the web app, which the desktop app loads too. Online, every launch asks the server
 * for the page first, so it always opens the latest deployed version without any update step. */
const worker = self as unknown as ServiceWorkerGlobalScope;
declare const CUBIX_VERSION: string;
declare const CUBIX_PRECACHE: string[];
/** Each language's dictionary bundle (src/client/i18n), by language. */
declare const CUBIX_DICTIONARIES: Record<string, string>;
/** Named after the case diagrams' content (desktop/web.ts). */
declare const CUBIX_CASES: string;
const SHELL = `cubix-shell-${CUBIX_VERSION}`;
const RUNTIME = "cubix-runtime-v1";
/** The case diagrams keep their names from one build to the next: kept as they are until one of them changes. */
const CASES = `cubix-cases-${CUBIX_CASES}`;
const DICTIONARIES = Object.values(CUBIX_DICTIONARIES);

worker.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // The dictionaries of the device's languages; another one joins the shell once used (see `asset`).
    const spoken = new Set(navigator.languages.map((tag) => tag.toLowerCase().split("-")[0]));
    const dictionaries = Object.entries(CUBIX_DICTIONARIES).filter(([language]) => spoken.has(language)).map(([, url]) => url);
    await cache.addAll([...CUBIX_PRECACHE, ...dictionaries].map((url) => new Request(url, { cache: "no-cache" })));
    await worker.skipWaiting();
  })());
});
worker.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // The previous shell stays for a page opened before this deployment, until the next one.
    const keys = await caches.keys();
    const shells = keys.filter((key) => key.startsWith("cubix-shell-") && key !== SHELL);
    for (const key of shells.slice(0, -1)) await caches.delete(key);
    for (const key of keys) if (key.startsWith("cubix-cases-") && key !== CASES) await caches.delete(key);
    // Earlier versions kept bundles and case diagrams here too, again at every load.
    const runtime = await caches.open(RUNTIME);
    for (const request of await runtime.keys()) if (/^\/(build|vendor|assets\/cases)\//.test(new URL(request.url).pathname)) await runtime.delete(request);
    await worker.clients.claim();
  })());
});
/** The app's page, the shell every path of the app opens offline; the site's root is the landing page. */
const APP = "/timer";
async function page(request: Request) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 4000);
  try {
    const response = await fetch(request, { cache: "no-cache", signal: timeout.signal });
    // A redirection (/fr to /fr/) is the browser's to follow.
    if (response.ok || response.type === "opaqueredirect") return response;
    return (await caches.match(APP, { cacheName: SHELL })) ?? response;
  } catch (error) {
    const cached = await caches.match(APP, { cacheName: SHELL }) ?? await caches.match(APP);
    if (cached) return cached;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
/** A file whose address names its content: the copy kept is the file, the network is only asked without one. Kept
 * in `keep`, when given, once fetched. */
async function lasting(request: Request, from: CacheStorage | Cache, keep?: string) {
  const cached = await from.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (keep && response.ok) await (await caches.open(keep)).put(request, response.clone());
  return response;
}
async function asset(request: Request, url: URL) {
  // Built bundles and vendor modules carry their version in their path; the shell has them, but a dictionary.
  if (/^\/(build|vendor)\//.test(url.pathname)) return lasting(request, caches, DICTIONARIES.includes(url.pathname) ? SHELL : undefined);
  if (url.pathname.startsWith("/assets/cases/")) return lasting(request, await caches.open(CASES), CASES);
  // Other files refresh in the background.
  const cached = await caches.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) await (await caches.open(RUNTIME)).put(request, response.clone());
    return response;
  });
  if (!cached) return refresh;
  refresh.catch(() => {});
  return cached;
}
worker.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== worker.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(event.request.mode === "navigate" ? page(event.request) : asset(event.request, url));
});
/**
 * A tab's engine took over from one of another version (bridge.ts `stale`). Tabs of recent versions reload by
 * themselves once no solve runs; tabs of versions from before that hand-over do not answer which engine they run,
 * and would keep writing with the old one: reload them.
 */
worker.addEventListener("message", (event) => {
  if (event.data?.type !== "stale") return;
  event.ports[0]?.postMessage({ ok: true });
  const source = (event.source as Client | null)?.id;
  event.waitUntil((async () => {
    const tabs = (await worker.clients.matchAll({ type: "window" })) as WindowClient[];
    await Promise.all(tabs.filter((tab) => tab.id !== source).map(async (tab) => {
      const channel = new MessageChannel();
      const answered = new Promise<boolean>((answer) => {
        channel.port1.onmessage = () => answer(true);
        setTimeout(() => answer(false), 1500);
      });
      tab.postMessage({ type: "engine?" }, [channel.port2]);
      if (!(await answered)) await tab.navigate(tab.url).catch(() => null);
    }));
  })());
});
