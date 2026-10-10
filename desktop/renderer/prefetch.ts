/**
 * Links fetched ahead: every internal link of the app and of the landing page, pointed at or focused, gets what it opens
 * fetched before the click (`onIntent`), the pages likeliest to come next once the browser has nothing to do (`whenIdle`).
 * One listener on the document for all links, rather than one per link. Nothing is fetched on a connection saving data
 * nor on a slow mobile one.
 */

/** Whether the connection should only carry what is asked for: data saving on, or a slow (2G, 3G) network. */
export function thrifty() {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (!!c.saveData || /2g|3g/.test(c.effectiveType ?? ""));
}

/** Calls `warm` with each link of this site the pointer rests on or the keyboard reaches (once per link and per second). */
export function onIntent(warm: (link: HTMLAnchorElement) => void) {
  let last: HTMLAnchorElement | null = null,
    at = 0;
  const intent = (e: Event) => {
    const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link || link.target === "_blank" || link.hasAttribute("download") || link.origin !== location.origin || thrifty()) return;
    if (link === last && performance.now() - at < 1000) return;
    last = link;
    at = performance.now();
    warm(link);
  };
  addEventListener("pointerover", intent, { passive: true });
  addEventListener("focusin", intent);
}

/** Runs `work` once the page has loaded and the browser is idle, unless the connection should be spared. */
export function whenIdle(work: () => void) {
  const go = () => void (!thrifty() && work()),
    run = () => ("requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 10_000 }) : setTimeout(go, 2000));
  if (document.readyState === "complete") run();
  else addEventListener("load", run, { once: true });
}

/** Fetches a file into the HTTP cache for a page about to be opened (the landing page's way to the app). */
export function prefetchFile(href: string) {
  if (document.head.querySelector(`link[rel="prefetch"][href="${CSS.escape(href)}"]`)) return;
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.href = href;
  document.head.append(link);
}
