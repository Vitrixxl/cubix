import { buildTheme, THEMES } from "../../src/client/lib/theme";

export const accents = Object.fromEntries(THEMES.map(t => [t.id, t.color]));

/** CSS adapter: the shared palette as custom properties. */
export function theme(name: string, light: boolean) {
  const id = THEMES.find(t => t.id === name)?.id ?? "t3-code";
  const t = buildTheme(id, light ? "light" : "dark");
  const tokens = {
    bg: t.bg, surface: t.surface, surface2: t.surface2, surface3: t.surface3,
    text: t.text, secondary: t.text2, accent: t.accent, series: t.series2,
    muted: t.readableMuted, good: t.good, danger: t.danger, warning: t.warning,
    soft: t.accentSoft, hover: t.hover, line: t.line, raised: t.raised,
  };
  return Object.fromEntries(Object.entries(tokens).map(([key, value]) => ["--" + key, value]));
}
