/** The landing page in the browser: the HTML is already there (desktop/web.ts renders it); React takes it over. */
import "../globals.css";
import { hydrateRoot } from "react-dom/client";
import { Landing } from "./Landing";
import { isLanguage, setLanguage } from "../../../src/client/i18n";
import { readRoute } from "../../../src/client/lib/route";
import { onIntent, prefetchFile } from "../prefetch";

// An installed app opens the app itself: a home-screen web app, or a desktop shell from before it opened /timer.
if (navigator.userAgent.includes("Electron") || matchMedia("(display-mode: standalone)").matches) location.replace("/timer");
else {
  // A page in another language than English (/fr/…) is hydrated in its own, its dictionary loaded first.
  const language = document.documentElement.lang;
  // A link to the app, pointed at or focused: its page and its first files, fetched ahead (desktop/web.ts names them).
  const app = document.querySelector<HTMLMetaElement>('meta[name="cubix-app"]')?.content.split(" ").filter(Boolean) ?? [];
  onIntent((link) => {
    if (!readRoute(link.pathname, link.search)) return;
    prefetchFile(link.pathname + link.search);
    app.forEach(prefetchFile);
  });
  void (isLanguage(language) ? setLanguage(language, false) : Promise.resolve()).then(() => hydrateRoot(document.getElementById("root")!, <Landing />));
}
