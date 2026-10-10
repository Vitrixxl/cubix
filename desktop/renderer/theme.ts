import { THEMES, buildTheme } from "../../src/client/lib/theme";
import { paintTheme } from "../appearance";
import { markSvg } from "./logo";

/** The accent choices of the settings: id, name and the swatch colour. */
export const accents = THEMES.map((t) => ({ id: t.id, name: t.name, color: t.color }));

/** The chosen accent and mode on the page (`paintTheme`, which boot.ts runs before the first frame), and on the tab's icon. */
export function applyTheme(name: string, light: boolean) {
  const id = paintTheme(name, light);
  favicon.accent = buildTheme(id, light ? "light" : "dark").accent;
  setFavicon();
}

/** The tab's icon is the app's mark (see `markSvg`): the puzzle being practised, one sticker in the chosen accent. */
const favicon = { accent: "", puzzle: "222" };
export function faviconPuzzle(puzzle: string) {
  favicon.puzzle = puzzle;
  setFavicon();
}
function setFavicon() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
  if (link && favicon.accent) link.href = "data:image/svg+xml," + encodeURIComponent(markSvg(favicon.puzzle, favicon.accent));
}
