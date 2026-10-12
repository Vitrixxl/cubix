import { msg } from "../i18n/msg";

/**
 * A device's first launch: the app gets ready behind a screen of its own, the startup cube (launcherCube.ts), rather
 * than showing itself half drawn. The web's is desktop/renderer/firstLaunch.ts (started by boot.ts), the phone's the
 * Launcher of StartupGate. Once the app is ready, LAUNCHED_KEY is kept and later launches open straight away.
 */
export const LAUNCHED_KEY = "cubix.launched";
export const FIRST_LAUNCH_TEXT = msg("Getting Qbix ready for its first launch…");

let ready = false;
const listeners = new Set<() => void>();

/** The app has what it needs (its data and its first scramble): the first launch's screen may go. */
export function appReady() {
  if (ready) return;
  ready = true;
  for (const listener of listeners) listener();
  listeners.clear();
  // The web's screen runs in a script of its own: it reads the page.
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-ready", "");
    dispatchEvent(new Event("cubix:ready"));
  }
}

/** Calls `listener` once the app is ready (at once if it is). */
export function onAppReady(listener: () => void) {
  if (ready) listener();
  else listeners.add(listener);
  return () => void listeners.delete(listener);
}
