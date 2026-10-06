/** The legal documents and where each is read: the pages, the settings, the sign-up form, the build and the sitemap. */
import { msg } from "../../../src/client/i18n/msg";

export type DocumentId = "legal" | "privacy" | "terms";
export const LEGAL_DOCUMENTS: { id: DocumentId; path: string; label: string }[] = [
  { id: "legal", path: "/legal", label: msg("Legal notice") },
  { id: "privacy", path: "/privacy", label: msg("Privacy policy") },
  { id: "terms", path: "/terms", label: msg("Terms of use") },
];
export const legalPath = (id: DocumentId) => "/" + id;
