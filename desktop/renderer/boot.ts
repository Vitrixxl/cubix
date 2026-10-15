/**
 * Run before the page is drawn (a blocking script in index.html's head), for a page written ahead of time
 * (desktop/prerender.tsx), which only search engines and automated browsers show: a person's browser sees the app draw
 * its own at once. Without scripts the page stays, readable.
 */
import { cachedAppearance, paintTheme } from "../../src/client/lib/appearance";
import { isCompact, isPhone } from "../../src/client/lib/viewport";
import { LAUNCHED_KEY } from "../../src/client/lib/firstLaunch";
import { captureInstall } from "../../src/client/lib/pwaInstall";
import { sharedSolveId } from "../../src/client/lib/sharedSolve";

// The browser's offer to install the app, which can come before either app mounts (pwaInstall.ts).
captureInstall();
// An app's behaviour in either app: its own menus only (the browser's reload, inspect, save image… stay out, but where
// text is typed or selected to copy), Ctrl+A selecting only in a field, and nothing dragged off the page but what is
// made to be dragged.
const typed = (target: EventTarget | null) => !!(target as HTMLElement).closest?.("input, textarea, [contenteditable=true]");
addEventListener("contextmenu", (e) => {
  if (!typed(e.target) && !getSelection()?.toString()) e.preventDefault();
});
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && !typed(e.target)) e.preventDefault();
});
addEventListener("dragstart", (e) => {
  if (!(e.target as HTMLElement).closest?.("[draggable=true]")) e.preventDefault();
});
const root = document.documentElement;
// The theme chosen on this device, never the default one first.
const { themeName, light } = cachedAppearance();
paintTheme(themeName, light);
try {
  if (localStorage.getItem("cubix.signedIn") === "1") root.setAttribute("data-account", "");
} catch {}
/**
 * A person's browser: the app draws its own page at once (its skeleton holds the scramble shown last, store.ts), and
 * the page written ahead of time, made without the app's data, stays for automated browsers (the tests) until the app
 * draws it. A search engine gets that page alone, styled, without the app: the same content, never a welcome wall.
 */
// A crawler's own name, never a phone's (Cubot) nor an audit's (Lighthouse), which measure the app a person gets.
const crawler = /\b(?!cubot)\w*bot\b|crawl|spider|slurp|facebookexternalhit/i.test(navigator.userAgent);
const person = !navigator.webdriver && !crawler;
if (person) root.setAttribute("data-direct", "");
if (!crawler) root.setAttribute("data-js", "");

/**
 * Which app this window loads: on a phone (its screen's short side), a touch tablet or a small window (viewport.ts), the
 * phone app (mobile/ for the web, exported by web.ts under /phone), laid out for its width; else the desktop app;
 * always the desktop app in the administration and on a shared solve's page (sharedSolve.ts), which has no startup cube
 * either. `cubix.phoneApp` = "off" in localStorage keeps the desktop app (its own phone layout, which the tests check).
 */
declare const CUBIX_DESKTOP_HEAD: string, CUBIX_PHONE_HEAD: string;
const admin = /^\/admin(\/|$)/.test(location.pathname);
const shared = !!sharedSolveId(location.pathname);
const phone = () => {
  try { if (localStorage.getItem("cubix.phoneApp") === "off") return false; } catch {}
  return !admin && !shared && (isPhone(innerWidth) || isPhone(Math.min(screen.width, screen.height)) || isCompact(innerWidth, innerHeight, matchMedia("(pointer: fine)").matches));
};
/**
 * The device's first launch (src/client/lib/firstLaunch.ts): the page stays hidden while the app gets ready, behind the
 * startup cube of firstLaunch.ts. A person's browser only.
 */
declare const CUBIX_FIRST_LAUNCH: string;
try {
  if (!admin && !shared && person && !localStorage.getItem(LAUNCHED_KEY)) {
    root.setAttribute("data-first-launch", "");
    document.write(`<style>html[data-first-launch]{background:var(--background)}html[data-first-launch] body>:not(#first-launch){visibility:hidden}</style><script src="${CUBIX_FIRST_LAUNCH}" defer></script>`);
  }
} catch {}
// No phone app in a development build where mobile/ did not build (web.ts).
const started = !crawler && !!CUBIX_PHONE_HEAD && phone();
const preloads = /<link rel="modulepreload"[^>]*>\n?/g;
document.write(crawler ? CUBIX_DESKTOP_HEAD.replace(preloads, "").replace(/<script[^>]*><\/script>/g, "") : started ? CUBIX_PHONE_HEAD : admin ? CUBIX_DESKTOP_HEAD.replace(preloads, "") : CUBIX_DESKTOP_HEAD);
/**
 * The offline shell (sw.ts), for either app, installs once the page has loaded and gone quiet: it downloads the
 * bundles of the app this window runs, never before the first screen's.
 */
if (!crawler && "serviceWorker" in navigator) {
  addEventListener("load", () => (window.requestIdleCallback ?? setTimeout)(() => void navigator.serviceWorker.register(started ? "/sw.js?app=phone" : "/sw.js").catch(() => {})), { once: true });
}
// A window resized across the line loads the other app, once it has the focus back: a sign-in popup (Google's) that a
// tiling window manager squeezes it beside must find the page it left, and the window its size again (given a moment).
if (CUBIX_PHONE_HEAD && !crawler) {
  const reload = () => { if (phone() !== started) location.reload(); };
  addEventListener("resize", () => document.hasFocus() ? reload() : addEventListener("focus", () => setTimeout(reload, 500), { once: true }));
}
