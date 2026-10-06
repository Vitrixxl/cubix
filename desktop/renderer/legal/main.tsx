/** A legal page in the browser: written in French at build time (desktop/web.ts), React takes it over (LegalPage
 * then shows English when the device's language is not French). */
import "../globals.css";
import { hydrateRoot } from "react-dom/client";
import { LegalPage } from "./LegalPage";
import { LEGAL_DOCUMENTS } from "./paths";

const id = LEGAL_DOCUMENTS.find((d) => d.path === location.pathname.replace(/\/$/, ""))?.id ?? "legal";
hydrateRoot(document.getElementById("root")!, <LegalPage id={id} />);
