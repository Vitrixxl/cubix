import { buildTheme, THEMES } from "../../src/client/lib/theme";

/** The accent choices of the settings: id, name and the swatch colour. */
export const accents = THEMES.map((t) => ({ id: t.id, name: t.name, color: t.color }));

const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(linear) as [number, number, number];
};
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The OKLCH hue of a hex colour, in degrees. */
function hueOf(hex: string) {
  const [r, g, b] = rgb(hex),
    l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b),
    a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
}

/**
 * The neutral tokens of the preset leaning towards the accent's hue: a calm tint, lightness unchanged, so each accent
 * has its own background in both modes. [lightness, chroma, alpha?] per token.
 */
const NEUTRALS: Record<"dark" | "light", Record<string, [number, number, number?]>> = {
  dark: {
    background: [0.155, 0.012],
    foreground: [0.975, 0.005],
    card: [0.19, 0.014],
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
    popover: [1, 0],
    muted: [0.955, 0.01],
    secondary: [0.955, 0.01],
    accent: [0.945, 0.012],
    "muted-foreground": [0.53, 0.02],
    border: [0.905, 0.012],
    input: [0.89, 0.014],
  },
};

/**
 * The chosen accent over the preset: primary, ring, sidebar primary and the two chart series, and the neutral surfaces
 * tinted with its hue, on the document root so the popups Base UI portals into <body> inherit them too. Dark or light
 * is the `dark` class.
 */
export function applyTheme(name: string, light: boolean) {
  const id = THEMES.find((t) => t.id === name)?.id ?? "t3-code";
  const t = buildTheme(id, light ? "light" : "dark");
  const root = document.documentElement;
  root.classList.toggle("dark", !light);
  root.style.colorScheme = light ? "light" : "dark";
  // White text while it stays readable on the accent, near-black on the pale ones.
  const foreground = 1.05 / (luminance(t.accent) + 0.05) >= 3.5 ? "oklch(0.985 0 0)" : "oklch(0.145 0 0)";
  const hue = hueOf(t.accent).toFixed(1),
    neutral = Object.fromEntries(
      Object.entries(NEUTRALS[light ? "light" : "dark"]).map(([key, [l, c, a]]) => [key, `oklch(${l} ${c} ${hue}${a ? ` / ${a}%` : ""})`]),
    );
  const tokens: Record<string, string> = {
    ...Object.fromEntries(Object.entries(neutral).map(([key, value]) => ["--" + key, value])),
    "--card-foreground": neutral.foreground!,
    "--popover-foreground": neutral.foreground!,
    "--secondary-foreground": neutral.foreground!,
    "--accent-foreground": neutral.foreground!,
    "--sidebar-foreground": neutral.foreground!,
    "--sidebar-accent": neutral.accent!,
    "--sidebar-accent-foreground": neutral.foreground!,
    "--sidebar-border": neutral.border!,
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", neutral.background!);
}
