import { buildTheme, THEMES } from "../../src/client/lib/theme";

/** The accent choices of the settings: id, name and the swatch colour. */
export const accents = THEMES.map((t) => ({ id: t.id, name: t.name, color: t.color }));

const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return 0.2126 * channel((n >> 16) / 255) + 0.7152 * channel(((n >> 8) & 255) / 255) + 0.0722 * channel((n & 255) / 255);
};

/**
 * The chosen accent over the preset's neutral tokens: primary, ring, sidebar primary and the two chart series, on
 * the document root so the popups Base UI portals into <body> inherit them too. Dark or light is the `dark` class.
 */
export function applyTheme(name: string, light: boolean) {
  const id = THEMES.find((t) => t.id === name)?.id ?? "t3-code";
  const t = buildTheme(id, light ? "light" : "dark");
  const root = document.documentElement;
  root.classList.toggle("dark", !light);
  root.style.colorScheme = light ? "light" : "dark";
  // White text while it stays readable on the accent, near-black on the pale ones.
  const foreground = 1.05 / (luminance(t.accent) + 0.05) >= 3.5 ? "oklch(0.985 0 0)" : "oklch(0.145 0 0)";
  const tokens: Record<string, string> = {
    "--primary": t.accent,
    "--primary-foreground": foreground,
    "--ring": t.accent,
    "--sidebar-primary": t.accent,
    "--sidebar-primary-foreground": foreground,
    "--sidebar-ring": t.accent,
    "--chart-1": t.accent,
    "--chart-2": t.series2,
  };
  for (const [key, value] of Object.entries(tokens)) root.style.setProperty(key, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#ffffff" : "#0a0a0a");
}
