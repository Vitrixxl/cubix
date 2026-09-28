import { createContext, useContext } from "react";
import type { TextStyle } from "react-native";
import { buildTheme as buildSharedTheme, mix, type Theme as SharedTheme, type ThemeId } from "../../src/client/lib/theme";
export { mix, alpha } from "../../src/client/lib/theme";

/**
 * The native palette: the shared theme plus the CSS variables of the web adapter
 * (desktop/renderer/theme.ts), under the same names, so a web rule `color: var(--x)` maps to `t.x`.
 *
 *   --bg bg · --surface surface · --surface2 surface2 · --surface3 surface3 · --text text
 *   --secondary secondary (= text2) · --muted muted (= readableMuted) · --accent accent · --soft soft
 *   --hover hover · --line line · --raised raised · --good good · --danger danger
 *
 * Extra derived tokens: `bar` (sidebar/tab bar, `color-mix(surface 35%, bg)`), `accentPressed`
 * (`.button.primary:hover`), `lineStrong` (focused input border), `checkboxLine`, `backdrop`
 * (dialog dim), `menuShadow` / `dialogShadow` (web box-shadows as native shadow props).
 */
export interface Theme extends SharedTheme {
  /** `--secondary`: plain buttons, secondary text. Same value as `text2`. */
  secondary: string;
  /** `--soft`: accent-tinted background (tags, selection). Same value as `accentSoft`. */
  soft: string;
  /** Tab bar and sidebar background: `color-mix(in srgb, var(--surface) 35%, var(--bg))`. */
  bar: string;
  /** `.button.primary:hover`: `color-mix(in srgb, var(--accent) 88%, #000)`, used while pressed. */
  accentPressed: string;
  /** Focused input border: `color-mix(in srgb, var(--text) 30%, transparent)`. */
  lineStrong: string;
  /** `.checkbox` border: `color-mix(in srgb, var(--text) 22%, transparent)`. */
  checkboxLine: string;
  /** `.modal-backdrop` background. */
  backdrop: string;
  /** `.select-menu` shadow (0 10px 28px -12px rgb(0 0 0 / .5)). */
  menuShadow: ShadowStyle;
  /** `.modal` shadow (0 16px 40px -16px rgb(0 0 0 / .55)). */
  dialogShadow: ShadowStyle;
}
type ShadowStyle = SharedTheme["shadow"];

const cache = new Map<string, Theme>();
/** The shared theme adapted like the web CSS adapter; `muted` is the readable muted (`--muted`). */
export function buildTheme(id: ThemeId, mode: "light" | "dark"): Theme {
  const key = `${id}:${mode}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const t = buildSharedTheme(id, mode);
  const light = mode === "light";
  const theme: Theme = {
    ...t,
    muted: t.readableMuted,
    secondary: t.text2,
    soft: t.accentSoft,
    bar: mix(t.surface, 35, t.bg),
    accentPressed: mix(t.accent, 88, "#000000"),
    lineStrong: t.text + "4d",
    checkboxLine: t.text + "38",
    backdrop: light ? "rgba(20, 26, 40, 0.22)" : "rgba(0, 0, 0, 0.5)",
    menuShadow: { shadowColor: "#000", shadowOpacity: light ? 0.18 : 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
    dialogShadow: { shadowColor: "#000", shadowOpacity: light ? 0.2 : 0.55, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  };
  cache.set(key, theme);
  return theme;
}

export const ThemeContext = createContext<Theme>(buildTheme("t3-code", "dark"));
export const useTheme = () => useContext(ThemeContext);

/**
 * Font families, loaded at startup by App.tsx (`FONT_FILES` in src/fonts.ts). Every `<Text>` and
 * `<TextInput>` is mapped to Geist automatically, and a `fontFamily: FONT.mono` style to Geist Mono;
 * `fontWeight` picks the matching file (400/500/600/700), so styles keep using plain weights.
 */
export const FONT = { sans: "Geist", mono: "GeistMono" };

type Weight = TextStyle["fontWeight"];
const WEIGHT_SUFFIX: Record<number, string> = { 400: "", 500: "-Medium", 600: "-SemiBold", 700: "-Bold" };
/** The loaded file for a weight: 100–400 regular, 500 medium, 600 semibold, 700–900 bold. */
function weightSuffix(weight: Weight): string {
  const n = weight === "bold" ? 700 : weight === "normal" || weight === undefined ? 400 : Number(weight);
  if (!Number.isFinite(n) || n <= 400) return WEIGHT_SUFFIX[400];
  return WEIGHT_SUFFIX[n >= 700 ? 700 : n >= 600 ? 600 : 500];
}
/** The concrete family of a Geist weight, e.g. `fontFamilyFor("600", true)` → "GeistMono-SemiBold". */
export function fontFamilyFor(weight: Weight, mono = false): string {
  return (mono ? FONT.mono : FONT.sans) + weightSuffix(weight);
}
