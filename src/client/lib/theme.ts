export type ThemeId = "peach" | "t3-code" | "t3-chat" | "grove" | "ocean" | "ember" | "iris";
/** The theme until the user picks one: peach, the app's orange. */
export const DEFAULT_THEME: ThemeId = "peach";

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
// shadcn tokens: the surfaces and inks tinted with the theme's accent (deep at night, pale by day), never a cold grey, the accent as
// primary. The web writes them as CSS variables on the document (desktop/renderer/theme.ts), the Android app as
// NativeWind variables (mobile/src/theme.ts).
// ---------------------------------------------------------------------------
const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
/** Relative luminance of a hex colour (WCAG). */
export function luminance(hex: string) {
  const [r, g, b] = parse(hex).map(v => linear(v / 255)) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The surfaces, inks and status colours of each mode, before the accent tints them. `background` is the page, `card`
 * the quiet panels (bg-2), `muted`/`secondary`/`input` the filled controls (surface), `accent` their hover (surface-2),
 * `popover` the floating ones. `faint` is the third ink (AA on the light surfaces, decorative only at night). Status: errors,
 * the worst time and DNF in soft red, the best in mint, +2 in butter; `lilac` the fourth colour of figures.
 */
const PALETTE: Record<"dark" | "light", Record<string, string>> = {
  dark: {
    background: "#0d0b0e", card: "#131114", sidebar: "#131114", popover: "#1a181b",
    muted: "#1a181b", secondary: "#1a181b", accent: "#242125", input: "#1a181b",
    foreground: "#f3f0f1", "muted-foreground": "#b8b1b4", faint: "#80787c", "timer-ink": "#fbf9fa",
    destructive: "#ff8f80", success: "#8fe0c2", warning: "#ffd98a", lilac: "#c9b4ff",
  },
  // Light: its surfaces are `LIGHT_SURFACES`. Every ink reaches 4.5:1 on all of them, whatever the accent.
  light: {
    foreground: "#1a1619", "muted-foreground": "#4b4549", faint: "#575055", "timer-ink": "#1a1619",
    destructive: "#9c2716", success: "#156045", warning: "#734d00", lilac: "#5c41b0",
  },
};
/** How much of the accent goes into the surfaces and into the inks: the whole app takes the theme's hue. */
const TINT = { surface: 9, ink: 6 };
const SURFACES = ["background", "card", "sidebar", "popover", "muted", "secondary", "accent", "input"];
/**
 * By day, never a grey: each surface is the theme's pale accent (the night's) on white, [percent of it, percent of the
 * deep accent darkening it]. Cards and popovers the lightest, the page under them, the filled controls a deeper sand of
 * the hue, what is chosen or hovered (`accent`) the brightest tint.
 */
const LIGHT_SURFACES: Record<string, [number, number]> = {
  background: [26, 3], card: [16, 0], sidebar: [16, 0], popover: [8, 0],
  muted: [30, 9], secondary: [30, 9], input: [30, 9], accent: [45, 0],
};
const INKS = ["foreground", "muted-foreground", "faint", "timer-ink"];

/**
 * Every colour token for an accent and a mode, without the leading `--`, as hex or `rgba()` (valid CSS and React
 * Native alike). `format` is kept for the callers; both give the same values.
 */
export function themeTokens(id: ThemeId, mode: "light" | "dark", _format: "oklch" | "rgb" = "oklch"): Record<string, string> {
  const t = buildTheme(id, mode) ?? buildTheme(DEFAULT_THEME, mode);
  const p = { ...PALETTE[mode] };
  const hue = (buildTheme(id, "dark") ?? buildTheme(DEFAULT_THEME, "dark")).accent;
  if (mode === "light") for (const [key, [pale, deep]] of Object.entries(LIGHT_SURFACES)) p[key] = mix(t.accent, deep, mix(hue, pale, "#ffffff"));
  else for (const key of SURFACES) p[key] = mix(hue, TINT.surface, p[key]!);
  for (const key of INKS) p[key] = mix(t.accent, TINT.ink, p[key]!);
  p.border = alpha(p.foreground!, mode === "dark" ? 8 : 14);
  p.edge = "transparent";
  // By day the pale stickers of a diagram seen from above (yellow, white) melt into the page: a dark rim holds them.
  p.rim = mode === "light" ? alpha(p.foreground!, 60) : "transparent";
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
