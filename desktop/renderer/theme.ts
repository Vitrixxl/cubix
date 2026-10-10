import { DEFAULT_THEME, THEMES, buildTheme, themeTokens, type ThemeId } from "../../src/client/lib/theme";
import { markSvg } from "./logo";

/** The accent choices of the settings: id, name and the swatch colour. */
export const accents = THEMES.map((t) => ({ id: t.id, name: t.name, color: t.color }));

/**
 * The chosen accent over the preset: primary, ring, sidebar primary and the two chart series, and the neutral surfaces
 * tinted with its hue (`themeTokens`, shared with the Android app), on the document root so the popups Base UI portals
 * into <body> inherit them too. Dark or light is the `dark` class.
 */
export function applyTheme(name: string, light: boolean) {
  const id = (THEMES.some((t) => t.id === name) ? name : DEFAULT_THEME) as ThemeId;
  const root = document.documentElement;
  root.classList.toggle("dark", !light);
  root.style.colorScheme = light ? "light" : "dark";
  const tokens = themeTokens(id, light ? "light" : "dark");
  for (const [key, value] of Object.entries(tokens)) root.style.setProperty("--" + key, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tokens.background!);
  favicon.accent = buildTheme(id as ThemeId, light ? "light" : "dark").accent;
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
