/** The landing page in the browser: the HTML is already there (desktop/web.ts renders it); React takes it over. */
import "../globals.css";
import { hydrateRoot } from "react-dom/client";
import { Landing } from "./Landing";
import { isLanguage, setLanguage } from "../../../src/client/i18n";

// An installed app opens the app itself: a home-screen web app, or a desktop shell from before it opened /timer.
if (navigator.userAgent.includes("Electron") || matchMedia("(display-mode: standalone)").matches) location.replace("/timer");
else {
  // A page in another language than English (/fr/…) is hydrated in its own, its dictionary loaded first.
  const language = document.documentElement.lang;
  void (isLanguage(language) ? setLanguage(language, false) : Promise.resolve()).then(() => hydrateRoot(document.getElementById("root")!, <Landing />));
}
