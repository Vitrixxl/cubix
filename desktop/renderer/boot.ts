/**
 * Run before the page is drawn (a blocking script in index.html's head), for a page written ahead of time
 * (desktop/prerender.tsx), which is a guest's on a wide window: an account's device never shows it, nor does a phone,
 * which the app lays out otherwise; both see the app draw its own at once. Without scripts the page stays, readable.
 */
import { cachedAppearance, paintTheme } from "../appearance";
import { isPhone } from "../../src/client/lib/viewport";

const root = document.documentElement;
// The theme chosen on this device, never the default one first.
const { themeName, light } = cachedAppearance();
paintTheme(themeName, light);
root.setAttribute("data-js", "");
try {
  if (localStorage.getItem("cubix.signedIn") === "1") root.setAttribute("data-account", "");
} catch {}

/**
 * Which app this window loads: on a phone (its screen's short side) or a window as narrow as one (viewport.ts), the
 * phone app (mobile/ for the web, exported by web.ts under /phone), else the desktop app; always the desktop app in
 * Electron and the administration. `cubix.phoneApp` = "off" in localStorage keeps the desktop app (its own phone layout,
 * which the tests check).
 */
declare const CUBIX_DESKTOP_HEAD: string, CUBIX_PHONE_HEAD: string;
const admin = /^\/admin(\/|$)/.test(location.pathname);
const phone = () => {
  try { if (localStorage.getItem("cubix.phoneApp") === "off") return false; } catch {}
  return !admin && !("cubixDesktop" in window) && (isPhone(innerWidth) || isPhone(Math.min(screen.width, screen.height)));
};
// No phone app in a development build where mobile/ did not build (web.ts).
const started = !!CUBIX_PHONE_HEAD && phone();
document.write(started ? CUBIX_PHONE_HEAD : admin ? CUBIX_DESKTOP_HEAD.replace(/<link rel="modulepreload"[^>]*>\n?/g, "") : CUBIX_DESKTOP_HEAD);
// The desktop app lays itself out for a narrow window: only the phone app loads again, once the window is wide.
if (started) addEventListener("resize", () => { if (!phone()) location.reload(); });
