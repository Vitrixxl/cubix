import { THEMES, themeTokens } from "../../src/client/lib/theme";

/** The accent choices of the settings: id, name and the swatch colour. */
export const accents = THEMES.map((t) => ({ id: t.id, name: t.name, color: t.color }));

/**
 * The chosen accent over the preset: primary, ring, sidebar primary and the two chart series, and the neutral surfaces
 * tinted with its hue (`themeTokens`, shared with the Android app), on the document root so the popups Base UI portals
 * into <body> inherit them too. Dark or light is the `dark` class.
 */
export function applyTheme(name: string, light: boolean) {
  const id = THEMES.find((t) => t.id === name)?.id ?? "t3-code";
  const root = document.documentElement;
  root.classList.toggle("dark", !light);
  root.style.colorScheme = light ? "light" : "dark";
  const tokens = themeTokens(id, light ? "light" : "dark");
  // The status colours stay those of globals.css.
  for (const [key, value] of Object.entries(tokens)) if (!["destructive", "success", "warning"].includes(key)) root.style.setProperty("--" + key, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tokens.background!);
}
