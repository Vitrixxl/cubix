/**
 * Who publishes Qbix and where it is hosted, for the legal notice and the privacy policy (documents.tsx). What is
 * still to be given reads `[À compléter : …]` on the pages until it is filled in here.
 */
const MISSING = (what: string) => `[À compléter : ${what}]`;

export const IDENTITY = {
  /** The person (or company) who publishes the app, and is responsible for the data. */
  editor: MISSING("nom et prénom de l'éditeur"),
  /** "personne physique" (an individual), or the company's form, capital and registration number. */
  status: "personne physique",
  address: MISSING("adresse postale de l'éditeur"),
  email: MISSING("adresse e-mail de contact"),
  /** Who is responsible for what is published: the editor, for an individual. */
  director: MISSING("nom du directeur de la publication"),
  /** Where the server runs. */
  host: {
    name: MISSING("nom de l'hébergeur"),
    address: MISSING("adresse de l'hébergeur"),
    phone: MISSING("téléphone de l'hébergeur"),
    /** Where the server and its data are. */
    country: "France",
  },
  site: "https://cubix.vitrixxl.fr",
  /** The date the documents were last changed. */
  updated: "2026-10-06",
} as const;

/** Whether a value is still to be given. */
export const missing = (value: string) => value.startsWith("[À compléter");
