/**
 * Installing Qbix as an app: the browser's offer (`beforeinstallprompt`, Chromium only), which can come before React
 * mounts, is kept by boot.ts on `window.cubixInstall`; either app's Install button shows while it is there and the app
 * isn't already running installed. Never on Android or iOS as native apps (no `document` there).
 */
type InstallPrompt = Event & { prompt(): Promise<void> };
declare global {
  interface Window { cubixInstall?: InstallPrompt | null }
}

const CHANGED = "cubix-install";
const browser = typeof document !== "undefined";
const changed = () => dispatchEvent(new Event(CHANGED));

/** boot.ts, before anything else: keeps the offer for later, cleared once the app is installed. */
export function captureInstall() {
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.cubixInstall = e as InstallPrompt;
    changed();
  });
  addEventListener("appinstalled", () => {
    window.cubixInstall = null;
    changed();
  });
}

const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** Whether an Install button shows. */
export const canInstall = () => browser && !!window.cubixInstall && !standalone();

/** Calls `listener` when the offer comes or goes; returns the unsubscribe (for `useSyncExternalStore`). */
export function onInstallChange(listener: () => void) {
  if (!browser) return () => {};
  addEventListener(CHANGED, listener);
  return () => removeEventListener(CHANGED, listener);
}

/** Opens the browser's install dialog; an offer is used once (the browser may make another later). */
export function install() {
  const offer = window.cubixInstall;
  if (!offer) return;
  window.cubixInstall = null;
  changed();
  void offer.prompt().catch(() => {});
}
