import { createContext, useContext } from "react";
import type { ThemeId } from "./state";

/** The web app's CSS custom properties, resolved to plain colours for React Native. */
export interface Theme {
  id: ThemeId; mode: "light" | "dark";
  bg: string; surface: string; surface2: string; surface3: string; hover: string;
  text: string; text2: string; muted: string; readableMuted: string; line: string;
  accent: string; accentSoft: string; series2: string;
  good: string; danger: string; warning: string;
  /** `.btn:hover` and `.select-trigger:hover` background */
  surface3Hover: string;
  /** learned toggle backgrounds */
  goodSoft: string; goodSoftStrong: string;
  /** timer save error background */
  dangerSoft: string;
  /** shortcut key / muted pill background */
  textSoft: string;
  shadow: { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number };
}

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

const DARK: Record<ThemeId, Omit<Theme, "id" | "mode" | "hover" | "readableMuted" | "line" | "good" | "danger" | "warning" | "surface3Hover" | "goodSoft" | "goodSoftStrong" | "dangerSoft" | "textSoft" | "shadow">> = {
  "t3-code": { bg: "#0b0b0e", surface: "#14141a", surface2: "#1c1c24", surface3: "#262630", text: "#eef0f5", text2: "#a9adba", muted: "#6f7384", accent: "#3987e5", accentSoft: "rgba(57, 135, 229, 0.16)", series2: "#d95926" },
  "t3-chat": { bg: "#130d14", surface: "#1c121c", surface2: "#291828", surface3: "#382036", text: "#fff1f7", text2: "#cdb0be", muted: "#886c7a", accent: "#ed2677", accentSoft: "rgba(237, 38, 119, 0.18)", series2: "#ff82b5" },
  grove: { bg: "#0b100d", surface: "#121a15", surface2: "#1a2720", surface3: "#25362c", text: "#edf7f0", text2: "#a7bdad", muted: "#687d6e", accent: "#39ad78", accentSoft: "rgba(57, 173, 120, 0.18)", series2: "#c5b878" },
  ocean: { bg: "#091015", surface: "#101b22", surface2: "#172832", surface3: "#213845", text: "#edf8fd", text2: "#a6bfca", muted: "#677e89", accent: "#42a4dc", accentSoft: "rgba(66, 164, 220, 0.18)", series2: "#8ad4da" },
  ember: { bg: "#120d0b", surface: "#1d1512", surface2: "#2b1d18", surface3: "#3b2921", text: "#fff4ee", text2: "#ccb2a5", muted: "#8b7063", accent: "#e1783f", accentSoft: "rgba(225, 120, 63, 0.18)", series2: "#f0b080" },
  iris: { bg: "#0e0b13", surface: "#17121e", surface2: "#21192d", surface3: "#30233f", text: "#f8f1ff", text2: "#bdaacf", muted: "#786987", accent: "#9a67df", accentSoft: "rgba(154, 103, 223, 0.2)", series2: "#d59ad7" },
};
const LIGHT_ACCENT: Record<ThemeId, { accent: string; series2: string }> = {
  "t3-code": { accent: "#245cc5", series2: "#a44514" },
  "t3-chat": { accent: "#b91b59", series2: "#7845b3" },
  grove: { accent: "#23734e", series2: "#876718" },
  ocean: { accent: "#186b98", series2: "#257571" },
  ember: { accent: "#a64c22", series2: "#855c17" },
  iris: { accent: "#7843b7", series2: "#a43881" },
};

const cache = new Map<string, Theme>();
export function buildTheme(id: ThemeId, mode: "light" | "dark"): Theme {
  const key = `${id}:${mode}`;
  const existing = cache.get(key);
  if (existing) return existing;
  let theme: Theme;
  if (mode === "dark") {
    const d = DARK[id];
    theme = {
      id, mode, ...d, hover: "rgba(255, 255, 255, 0.05)",
      readableMuted: mix(d.text, 65, d.bg), line: alpha(d.text, 9),
      good: "#4ccf4c", danger: "#e66767", warning: "#fab219",
      surface3Hover: mix(d.surface3, 70, mix(d.text, 8, d.surface3)),
      goodSoft: alpha("#4ccf4c", 12), goodSoftStrong: alpha("#4ccf4c", 20),
      dangerSoft: mix("#e66767", 18, d.surface), textSoft: alpha(d.text, 8),
      shadow: { shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
    };
  } else {
    const { accent, series2 } = LIGHT_ACCENT[id];
    const text = "#192334", bg = mix(accent, 4, "#ffffff"), surface = mix(accent, 7, "#ffffff");
    theme = {
      id, mode, bg, surface, surface2: mix(accent, 11, "#ffffff"), surface3: mix(accent, 16, "#ffffff"),
      hover: alpha(accent, 7), text, text2: "#48566b", muted: "#617087",
      readableMuted: mix(text, 65, bg), line: alpha(text, 9),
      accent, accentSoft: alpha(accent, 12), series2,
      good: "#237444", danger: "#bb3545", warning: "#93600b",
      surface3Hover: mix(mix(accent, 16, "#ffffff"), 70, mix(text, 8, mix(accent, 16, "#ffffff"))),
      goodSoft: alpha("#237444", 12), goodSoftStrong: alpha("#237444", 20),
      dangerSoft: mix("#bb3545", 18, surface), textSoft: alpha(text, 8),
      shadow: { shadowColor: "#1c2d48", shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
    };
  }
  cache.set(key, theme);
  return theme;
}

export const ThemeContext = createContext<Theme>(buildTheme("t3-code", "dark"));
export const useTheme = () => useContext(ThemeContext);

export const FONT = { sans: undefined as string | undefined, mono: "monospace" };
