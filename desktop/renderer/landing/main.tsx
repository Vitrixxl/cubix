/** The landing page in the browser: the HTML is already there (desktop/web.ts renders it); React takes it over. */
import "../globals.css";
import { hydrateRoot } from "react-dom/client";
import { Landing } from "./Landing";
import { isLanguage, provide, setLanguage } from "../../../src/client/i18n";
import { readRoute } from "../../../src/client/lib/route";
import { onIntent, prefetchFile } from "../prefetch";

// An installed web app opens the app itself.
if (matchMedia("(display-mode: standalone)").matches) location.replace("/timer");
else {
  // A page in another language than English (/fr/…) is hydrated in its own, with its texts written in the page
  // (desktop/web.ts): another language's dictionary loads once chosen.
  const language = document.documentElement.lang, words = document.getElementById("dictionary")?.textContent;
  if (words && isLanguage(language)) provide(language, JSON.parse(words));
  // A link to the app, pointed at or focused: its page and its first files, fetched ahead (desktop/web.ts names them).
  const app = document.querySelector<HTMLMetaElement>('meta[name="cubix-app"]')?.content.split(" ").filter(Boolean) ?? [];
  onIntent((link) => {
    if (!readRoute(link.pathname, link.search)) return;
    prefetchFile(link.pathname + link.search);
    app.forEach(prefetchFile);
  });
  void (isLanguage(language) ? setLanguage(language, false) : Promise.resolve()).then(() => hydrateRoot(document.getElementById("root")!, <Landing />));
}
