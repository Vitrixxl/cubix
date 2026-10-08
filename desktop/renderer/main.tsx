/** The page's entry: the administration under /admin, the app everywhere else. Each loads only its own code, so the
 * administration never starts the app's data engine. */
import "./globals.css";

// The app's own menus only: the browser's (reload, inspect, save image…) stays out, except where text is typed.
addEventListener("contextmenu", (e) => {
  if (!(e.target as HTMLElement).closest?.("input, textarea, [contenteditable=true]")) e.preventDefault();
});

if (/^\/admin(\/|$)/.test(location.pathname)) void import("./admin/admin");
else {
  // The engine and the dictionary start beside the app's code rather than once it has run.
  void import("./bridge");
  void import("../../src/client/i18n").then((i18n) => i18n.load(i18n.preferred())).catch(() => {});
  void import("./app");
}
