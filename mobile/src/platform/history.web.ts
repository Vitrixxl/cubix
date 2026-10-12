import { getDefaultStore } from "jotai";
import { language, onLanguage, setLanguage, start } from "../../../src/client/i18n";
import { localePath, splitLanguage } from "../../../src/client/lib/route";
import { goBackAtom, lastNavigationAtom, puzzleAtom, replaceRouteAtom, routeAtom, routeOfUrl, urlOfRoute } from "../state";

/**
 * The app at the web app's addresses (/timer, /fr/learn/…): it opens on the page and in the language of the address,
 * the address bar follows its route, and the browser's back and forward buttons walk its history. Each entry the app
 * pushes is numbered (`history.state.cubix`), so a browser step tells back from forward.
 */
const store = getDefaultStore();
const address = () => localePath(language(), urlOfRoute(store.get(routeAtom)));
const depth = () => (history.state as { cubix?: number } | null)?.cubix ?? 0;

const prefix = splitLanguage(location.pathname).language;
// After the language i18n.ts starts with (the device's), the address's.
if (prefix) void start().then(() => setLanguage(prefix, false));
const opened = routeOfUrl(location.href);
if (opened) {
  if (opened.puzzle) store.set(puzzleAtom, opened.puzzle);
  store.set(replaceRouteAtom, opened.route);
}
history.replaceState({ cubix: 0 }, "", address());
let shown = 0;
/** A step back the app asked of the browser, or a route set from a browser step: the address is already right. */
let following = false;

store.sub(routeAtom, () => {
  if (following) return;
  const kind = store.get(lastNavigationAtom);
  if (kind === "push") history.pushState({ cubix: ++shown }, "", address());
  else if (kind === "pop" && shown > 0) { following = true; history.back(); }
  else history.replaceState(history.state, "", address());
});
addEventListener("popstate", () => {
  if (following) { following = false; shown = depth(); return void history.replaceState(history.state, "", address()); }
  const back = depth() < shown;
  shown = depth();
  following = true;
  try {
    if (back) store.set(goBackAtom);
    // Forward, or a back step past what the app remembers: the page of the address.
    const target = routeOfUrl(location.href);
    if (target && urlOfRoute(target.route) !== urlOfRoute(store.get(routeAtom))) store.set(replaceRouteAtom, target.route);
  } finally { following = false; }
  history.replaceState(history.state, "", address());
});
// The address follows the language: English at the root, any other under its prefix.
onLanguage(() => history.replaceState(history.state, "", address()));
