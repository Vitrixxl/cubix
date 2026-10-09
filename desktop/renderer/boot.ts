/**
 * Run before the page is drawn (a blocking script in index.html's head), for a page written ahead of time
 * (desktop/prerender.tsx), which is a guest's on a wide window: an account's device never shows it, nor does a phone,
 * which the app lays out otherwise; both see the app draw its own at once. Without scripts the page stays, readable.
 */
const root = document.documentElement;
root.setAttribute("data-js", "");
try {
  if (localStorage.getItem("cubix.signedIn") === "1") root.setAttribute("data-account", "");
} catch {}
