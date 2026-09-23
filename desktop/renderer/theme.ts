import { buildTheme, THEMES } from "../../src/client/lib/theme";

export const accents = Object.fromEntries(THEMES.map(t => [t.id, t.color]));

/** CSS adapter. Preserve the desktop's original 8-bit alpha rounding. */
export function theme(name: string, light: boolean) {
  const id = THEMES.find(t => t.id === name)?.id ?? "t3-code";
  const t = buildTheme(id, light ? "light" : "dark");
  const tokens = {
    bg: t.bg, surface: t.surface, surface2: t.surface2, surface3: t.surface3,
    text: t.text, secondary: t.text2, accent: t.accent, series: t.series2,
    muted: t.readableMuted, good: t.good, danger: t.danger,
    diagram: light ? t.surface2 : "#a1a1ad",
    soft: t.accent + (light ? "1e" : id === "iris" ? "33" : id === "t3-code" ? "28" : "2d"),
    hover: light ? t.accent + "11" : "#ffffff0d", line: t.text + "16",
  };
  return Object.fromEntries(Object.entries(tokens).map(([key, value]) => ["--" + key, value]));
}
