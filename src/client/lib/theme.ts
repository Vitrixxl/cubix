export type ThemeId = "t3-code" | "t3-chat" | "grove" | "ocean" | "ember" | "iris";
/** The theme until the user picks one: pink. */
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

/** Each theme's accent and second chart series (the rolling Ao5), per mode. */
const ACCENTS: Record<"dark" | "light", Record<ThemeId, { accent: string; series2: string }>> = {
  dark: {
    "t3-code": { accent: "#3987e5", series2: "#d95926" },
    "t3-chat": { accent: "#ed2677", series2: "#ff82b5" },
    grove: { accent: "#39ad78", series2: "#c5b878" },
    ocean: { accent: "#42a4dc", series2: "#8ad4da" },
    ember: { accent: "#e1783f", series2: "#f0b080" },
    iris: { accent: "#9a67df", series2: "#d59ad7" },
  },
  light: {
    "t3-code": { accent: "#245cc5", series2: "#a44514" },
    "t3-chat": { accent: "#b91b59", series2: "#7845b3" },
    grove: { accent: "#23734e", series2: "#876718" },
    ocean: { accent: "#186b98", series2: "#257571" },
    ember: { accent: "#a64c22", series2: "#855c17" },
    iris: { accent: "#7843b7", series2: "#a43881" },
  },
};
/** A theme's accent and second chart series in a mode. */
export const buildTheme = (id: ThemeId, mode: "light" | "dark") => ACCENTS[mode][id];

export const THEMES = ([
  ["t3-code", "Blue"], ["t3-chat", "Pink"], ["grove", "Green"],
  ["ocean", "Cyan"], ["ember", "Orange"], ["iris", "Purple"],
] as const).map(([id, name]) => ({ id, name, color: ACCENTS.dark[id].accent }));

// ---------------------------------------------------------------------------
// shadcn tokens: the preset's neutrals leaning towards the accent's hue, the accent as primary. The web writes them as
// CSS variables on the document (desktop/renderer/theme.ts), the Android app as NativeWind variables (mobile/src/theme.ts).
// ---------------------------------------------------------------------------
const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const linearRgb = (hex: string) => parse(hex).map(v => linear(v / 255)) as Rgb;
/** Relative luminance of a hex colour (WCAG). */
function luminance(hex: string) {
  const [r, g, b] = linearRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** The OKLCH hue of a hex colour, in degrees. */
function hueOf(hex: string) {
  const [r, g, b] = linearRgb(hex),
    l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b),
    a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
}
/** An OKLCH colour as sRGB hex, or `rgba()` when it is translucent (`alpha` in %). Out-of-gamut channels are clipped. */
function oklchToRgb(l: number, c: number, h: number, alpha?: number): string {
  const hr = (h * Math.PI) / 180, a = c * Math.cos(hr), b = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const encode = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055);
  const rgb: Rgb = [
    encode(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    encode(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    encode(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
  if (alpha === undefined) return toHex(rgb);
  const [r, g, bl] = rgb.map(v => Math.round(Math.max(0, Math.min(255, v))));
  return `rgba(${r}, ${g}, ${bl}, ${alpha / 100})`;
}

/**
 * The neutral tokens of the preset leaning towards the accent's hue: a calm tint, lightness unchanged, so each accent
 * has its own background in both modes. [lightness, chroma, alpha %?] per token.
 */
const NEUTRALS: Record<"dark" | "light", Record<string, [number, number, number?]>> = {
  dark: {
    background: [0.155, 0.012],
    foreground: [0.975, 0.005],
    card: [0.19, 0.014],
    sidebar: [0.175, 0.014],
    popover: [0.21, 0.016],
    muted: [0.265, 0.018],
    secondary: [0.265, 0.018],
    accent: [0.28, 0.02],
    "muted-foreground": [0.72, 0.02],
    border: [0.85, 0.04, 11],
    input: [0.85, 0.04, 16],
  },
  light: {
    background: [0.982, 0.006],
    foreground: [0.17, 0.012],
    card: [0.998, 0.002],
    sidebar: [0.965, 0.01],
    popover: [1, 0],
    muted: [0.955, 0.01],
    secondary: [0.955, 0.01],
    accent: [0.945, 0.012],
    "muted-foreground": [0.53, 0.02],
    border: [0.905, 0.012],
    input: [0.89, 0.014],
  },
};
/** The preset's status colours, the same for every accent: errors (and the worst time, DNF), the best time and +2. */
const STATUS: Record<"dark" | "light", Record<string, [number, number, number]>> = {
  dark: { destructive: [0.704, 0.191, 22.216], success: [0.77, 0.17, 150], warning: [0.82, 0.15, 80] },
  light: { destructive: [0.577, 0.245, 27.325], success: [0.52, 0.13, 150], warning: [0.58, 0.13, 70] },
};

/**
 * Every colour token of the shadcn preset for an accent and a mode, without the leading `--`: CSS `oklch()` values for
 * the web, or hex / `rgba()` values (`format: "rgb"`) for React Native, which has no OKLCH.
 */
export function themeTokens(id: ThemeId, mode: "light" | "dark", format: "oklch" | "rgb" = "oklch"): Record<string, string> {
  const t = buildTheme(id, mode);
  const color = (l: number, c: number, h: number, a?: number) =>
    format === "rgb" ? oklchToRgb(l, c, h, a) : `oklch(${l} ${c} ${h.toFixed(1)}${a ? ` / ${a}%` : ""})`;
  // White text while it stays readable on the accent, near-black on the pale ones.
  const foreground = 1.05 / (luminance(t.accent) + 0.05) >= 3.5 ? color(0.985, 0, 0) : color(0.145, 0, 0);
  const hue = hueOf(t.accent);
  const neutral = Object.fromEntries(Object.entries(NEUTRALS[mode]).map(([key, [l, c, a]]) => [key, color(l, c, hue, a)]));
  // Written as the preset writes them: the hue is not rounded.
  const status = Object.fromEntries(Object.entries(STATUS[mode]).map(([key, [l, c, h]]) => [key, format === "rgb" ? oklchToRgb(l, c, h) : `oklch(${l} ${c} ${h})`]));
  return {
    ...neutral,
    ...status,
    "card-foreground": neutral.foreground!,
    "popover-foreground": neutral.foreground!,
    "secondary-foreground": neutral.foreground!,
    "accent-foreground": neutral.foreground!,
    "sidebar-foreground": neutral.foreground!,
    "sidebar-accent": neutral.accent!,
    "sidebar-accent-foreground": neutral.foreground!,
    "sidebar-border": neutral.border!,
    primary: t.accent,
    "primary-foreground": foreground,
    ring: t.accent,
    "sidebar-primary": t.accent,
    "sidebar-primary-foreground": foreground,
    "sidebar-ring": t.accent,
    "chart-1": t.accent,
    "chart-2": t.series2,
  };
}
