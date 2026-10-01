import { DEFAULT_THEME, THEMES, buildTheme, themeTokens, type ThemeId } from "../../src/client/lib/theme";

/** The accent choices of the settings: id, name and the swatch colour. */
export const accents = THEMES.map((t) => ({ id: t.id, name: t.name, color: t.color }));

/**
 * The chosen accent over the preset: primary, ring, sidebar primary and the two chart series, and the neutral surfaces
 * tinted with its hue (`themeTokens`, shared with the Android app), on the document root so the popups Base UI portals
 * into <body> inherit them too. Dark or light is the `dark` class.
 */
export function applyTheme(name: string, light: boolean) {
  const id = THEMES.find((t) => t.id === name)?.id ?? DEFAULT_THEME;
  const root = document.documentElement;
  root.classList.toggle("dark", !light);
  root.style.colorScheme = light ? "light" : "dark";
  const tokens = themeTokens(id, light ? "light" : "dark");
  for (const [key, value] of Object.entries(tokens)) root.style.setProperty("--" + key, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tokens.background!);
  setFavicon(buildTheme(id as ThemeId, light ? "light" : "dark").accent);
}

/**
 * The tab's icon is the app's mark in the chosen accent: the top right sticker takes it, the three others follow the
 * browser's own light or dark look (the tab strip's, not the app's) so they always stand out.
 */
function setFavicon(accent: string) {
  const sticker = (x: number, y: number, fill?: string) =>
    `<rect x="${x}" y="${y}" width="8.25" height="8.25" rx="2.2"${fill ? ` fill="${fill}"` : ' class="s"'}/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><style>.s{fill:#262626}@media (prefers-color-scheme:dark){.s{fill:#e5e5e5}}</style>` +
    sticker(0, 0) + sticker(9.75, 0, accent) + sticker(0, 9.75) + sticker(9.75, 9.75) + "</svg>";
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
  if (link) link.href = "data:image/svg+xml," + encodeURIComponent(svg);
}
