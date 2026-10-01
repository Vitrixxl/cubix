import { createContext, useContext } from "react";
import { mix, themeTokens, type ThemeId } from "../../src/client/lib/theme";
export { alpha, mix } from "../../src/client/lib/theme";

/**
 * The app's colours: the web's shadcn tokens (`themeTokens`, shared with desktop/renderer/theme.ts) for an accent and
 * a mode, as hex / rgba values. `ThemeProvider` hands them to NativeWind as CSS variables (`bg-primary`,
 * `text-muted-foreground`…); drawings that need a plain colour (SVG charts, cube pictures) read them with `useColors`.
 */
export interface Colors {
  id: ThemeId;
  mode: "light" | "dark";
  background: string;
  foreground: string;
  card: string;
  popover: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  border: string;
  input: string;
  destructive: string;
  success: string;
  warning: string;
  /** Second chart series (the rolling Ao5). */
  chart2: string;
  /** Timer digits: 85% text, 15% accent. */
  timer: string;
  /** The milliseconds: the muted text leaning towards the accent. */
  timerMs: string;
  /** Every token under its CSS variable name, for NativeWind. */
  variables: Record<`--${string}`, string>;
}

const cache = new Map<string, Colors>();
export function buildColors(id: ThemeId, mode: "light" | "dark"): Colors {
  const key = `${id}:${mode}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const tokens = themeTokens(id, mode, "rgb");
  const timer = mix(tokens.primary!, 15, tokens.foreground!);
  const timerMs = mix(tokens.primary!, 22, tokens["muted-foreground"]!);
  const all = { ...tokens, timer, "timer-ms": timerMs };
  const colors: Colors = {
    id, mode,
    background: tokens.background!, foreground: tokens.foreground!, card: tokens.card!, popover: tokens.popover!,
    primary: tokens.primary!, primaryForeground: tokens["primary-foreground"]!, secondary: tokens.secondary!,
    muted: tokens.muted!, mutedForeground: tokens["muted-foreground"]!, accent: tokens.accent!,
    border: tokens.border!, input: tokens.input!, destructive: tokens.destructive!, success: tokens.success!,
    warning: tokens.warning!, chart2: tokens["chart-2"]!, timer, timerMs,
    variables: Object.fromEntries(Object.entries(all).map(([name, value]) => [`--${name}`, value])) as Colors["variables"],
  };
  cache.set(key, colors);
  return colors;
}

export const ColorsContext = createContext<Colors>(buildColors("t3-code", "dark"));
/** The current colours as plain values. */
export const useColors = () => useContext(ColorsContext);

/** Geist and Geist Mono, linked natively with their four weights (app.json), so `fontWeight` picks the file. */
export const FONT = { sans: "Geist", mono: "GeistMono" };
