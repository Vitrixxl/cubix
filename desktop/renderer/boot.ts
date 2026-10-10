/**
 * Run before the page is drawn (a blocking script in index.html's head), for a page written ahead of time
 * (desktop/prerender.tsx), which is a guest's on a wide window: an account's device never shows it, nor does a phone,
 * which the app lays out otherwise; both see the app draw its own at once. Without scripts the page stays, readable.
 */
import { cachedAppearance, paintTheme } from "../appearance";

const root = document.documentElement;
// The theme chosen on this device, never the default one first.
const { themeName, light } = cachedAppearance();
paintTheme(themeName, light);
root.setAttribute("data-js", "");
try {
  if (localStorage.getItem("cubix.signedIn") === "1") root.setAttribute("data-account", "");
} catch {}
