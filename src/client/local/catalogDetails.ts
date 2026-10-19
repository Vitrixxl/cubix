/**
 * The cases' algorithms, other setups and notes, a megabyte and a half nothing reads at start-up: the web builds
 * (desktop/web.ts `catalogSplit`) leave them out of the catalogue the app and its engine start with, and give this
 * module them alone, a chunk of its own, fetched by what reads them. Elsewhere it is the whole catalogue.
 */
import catalog from "../../../data/catalog.json";

/** Gives `cases` (the catalogue's, or the web app's copy of it) their algorithms, other setups and notes. */
export function addDetails(cases: readonly { id: string }[]) {
  const byId = new Map(cases.map(c => [c.id, c]));
  for (const details of catalog.cases) {
    const c = byId.get(details.id);
    if (c) Object.assign(c, details);
  }
}
