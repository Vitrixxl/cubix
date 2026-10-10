export type ThemeId = "peach" | "t3-code" | "t3-chat" | "grove" | "ocean" | "ember" | "iris";
/** The theme until the user picks one: pink (T3 Chat). */
export const DEFAULT_THEME: ThemeId = "t3-chat";

type Rgb = [number, number, number];
function parse(color: string): Rgb {
  const hex = color.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map(c => c + c).join("") : hex;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}
const toHex = ([r, g, b]: Rgb) => "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
/** `color-mix(in srgb, a p%, b)` */
export function mix(a: string, percent: number, b: string): string {
  const x = parse(a), y = parse(b), p = percent / 100;
  return toHex([x[0] * p + y[0] * (1 - p), x[1] * p + y[1] * (1 - p), x[2] * p + y[2] * (1 - p)]);
}
/** `color-mix(in srgb, a p%, transparent)` */
export const alpha = (color: string, percent: number) => { const [r, g, b] = parse(color); return `rgba(${r}, ${g}, ${b}, ${(percent / 100).toFixed(3)})`; };

/** Each theme's accent and second chart series (the rolling Ao5), per mode. Light accents are darkened for contrast on cream. */
const ACCENTS: Record<"dark" | "light", Record<ThemeId, { accent: string; series2: string }>> = {
  dark: {
    peach: { accent: "#ffb48c", series2: "#c9b4ff" },
    "t3-code": { accent: "#7fb2ff", series2: "#ffb48c" },
    "t3-chat": { accent: "#f5609f", series2: "#c9b4ff" },
    grove: { accent: "#8fe0c2", series2: "#ffd98a" },
    ocean: { accent: "#7fd4e8", series2: "#c9b4ff" },
    ember: { accent: "#ff9d6b", series2: "#ffd98a" },
    iris: { accent: "#c9b4ff", series2: "#ffb48c" },
  },
  light: {
    peach: { accent: "#8f3a10", series2: "#5c41b0" },
    "t3-code": { accent: "#2a5cb8", series2: "#a44514" },
    "t3-chat": { accent: "#b51b5c", series2: "#6a4fc0" },
    grove: { accent: "#1d7656", series2: "#855c17" },
    ocean: { accent: "#176a8f", series2: "#6a4fc0" },
    ember: { accent: "#a8441a", series2: "#855c17" },
    iris: { accent: "#6a4fc0", series2: "#a8441a" },
  },
};
/** A theme's accent and second chart series in a mode. */
export const buildTheme = (id: ThemeId, mode: "light" | "dark") => ACCENTS[mode][id];

export const THEMES = ([
  ["peach", "Peach"], ["t3-code", "Blue"], ["t3-chat", "Pink"], ["grove", "Green"],
  ["ocean", "Cyan"], ["ember", "Orange"], ["iris", "Purple"],
] as const).map(([id, name]) => ({ id, name, color: ACCENTS.dark[id].accent }));

// ---------------------------------------------------------------------------
// shadcn tokens: Qbix's warm surfaces (a deep plum-brown at night, cream by day), never a cold grey, the accent as
// primary. The web writes them as CSS variables on the document (desktop/renderer/theme.ts), the Android app as
// NativeWind variables (mobile/src/theme.ts).
// ---------------------------------------------------------------------------
const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
/** Relative luminance of a hex colour (WCAG). */
function luminance(hex: string) {
  const [r, g, b] = parse(hex).map(v => linear(v / 255)) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The surfaces, inks and status colours of each mode. `background` is the page, `card` the quiet panels (bg-2),
 * `muted`/`secondary`/`input` the filled controls (surface), `accent` their hover (surface-2), `popover` the floating
 * ones. `faint` is the third ink (AA on the light surfaces, decorative only at night). `edge` outlines the filled controls
 * by day (3:1 against the page and the cards, WCAG 1.4.11), none at night. Status: errors, the worst time and DNF in
 * soft red, the best in mint, +2 in butter; `lilac` the fourth colour of figures.
 */
const PALETTE: Record<"dark" | "light", Record<string, string>> = {
  dark: {
    background: "#1c1317", card: "#24181d", sidebar: "#24181d", popover: "#2c1f25",
    muted: "#2c1f25", secondary: "#2c1f25", accent: "#372830", input: "#2c1f25",
    foreground: "#f8ebe4", "muted-foreground": "#c4aaa6", faint: "#8c7276",
    border: "rgba(248, 235, 228, 0.08)", edge: "transparent", "timer-ink": "#fff4ee",
    destructive: "#ff8f80", success: "#8fe0c2", warning: "#ffd98a", lilac: "#c9b4ff",
  },
  // Light: a cream page, warm white cards above it, controls filled a shade darker and outlined in `edge`. Every ink
  // reaches 4.5:1 on the page, the cards and the controls (status inks on the hover fill `accent` too).
  light: {
    background: "#f4eae1", card: "#fffbf8", sidebar: "#fffbf8", popover: "#fffdfb",
    muted: "#ecdccf", secondary: "#ecdccf", accent: "#e2cbbb", input: "#ecdccf",
    foreground: "#22151a", "muted-foreground": "#56404a", faint: "#685358",
    border: "rgba(34, 21, 26, 0.14)", edge: "#947d76", "timer-ink": "#22151a",
    destructive: "#a52a18", success: "#156045", warning: "#734d00", lilac: "#5c41b0",
  },
};

/**
 * Every colour token for an accent and a mode, without the leading `--`, as hex or `rgba()` (valid CSS and React
 * Native alike). `format` is kept for the callers; both give the same values.
 */
export function themeTokens(id: ThemeId, mode: "light" | "dark", _format: "oklch" | "rgb" = "oklch"): Record<string, string> {
  const t = buildTheme(id, mode) ?? buildTheme(DEFAULT_THEME, mode);
  const p = PALETTE[mode];
  // The page's ink on the pale accents, cream on the dark ones.
  const onAccent = 1.05 / (luminance(t.accent) + 0.05) >= 4.5 ? "#fff8f3" : "#1c1317";
  return {
    ...p,
    "card-foreground": p.foreground!,
    "popover-foreground": p.foreground!,
    "secondary-foreground": p.foreground!,
    "accent-foreground": p.foreground!,
    "sidebar-foreground": p.foreground!,
    "sidebar-accent": p.accent!,
    "sidebar-accent-foreground": p.foreground!,
    "sidebar-border": p.border!,
    primary: t.accent,
    "primary-foreground": onAccent,
    ring: t.accent,
    "sidebar-primary": t.accent,
    "sidebar-primary-foreground": onAccent,
    "sidebar-ring": t.accent,
    "chart-1": t.accent,
    "chart-2": t.series2,
  };
}
