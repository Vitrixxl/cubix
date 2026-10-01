import { createContext, useContext } from "react";
import { mix, themeTokens, type ThemeId } from "../../src/client/lib/theme";
export { alpha, mix } from "../../src/client/lib/theme";

/**
 * The app's colours: the web's shadcn tokens (`themeTokens`, shared with desktop/renderer/theme.ts) for an accent and
 * a mode, as hex / rgba values. `ThemeProvider` hands them to NativeWind as CSS variables (`bg-primary`,
 * `text-muted-foreground`…); drawings that need a plain colour (SVG charts, cube pictures) read them with `useColors`.
 */
export interface Colors {
  background: string;
  foreground: string;
  card: string;
  popover: string;
  primary: string;
  muted: string;
  mutedForeground: string;
  border: string;
  /** Second chart series (the rolling Ao5). */
  chart2: string;
  /** Every token under its CSS variable name, for NativeWind. */
  variables: Record<`--${string}`, string>;
}

const cache = new Map<string, Colors>();
export function buildColors(id: ThemeId, mode: "light" | "dark"): Colors {
  const key = `${id}:${mode}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const tokens = themeTokens(id, mode, "rgb");
  const all = {
    ...tokens,
    /** Timer digits: 85% text, 15% accent. */
    timer: mix(tokens.primary!, 15, tokens.foreground!),
    /** The milliseconds: the muted text leaning towards the accent. */
    "timer-ms": mix(tokens.primary!, 22, tokens["muted-foreground"]!),
  };
  const colors: Colors = {
    background: tokens.background!, foreground: tokens.foreground!, card: tokens.card!, popover: tokens.popover!,
    primary: tokens.primary!, muted: tokens.muted!, mutedForeground: tokens["muted-foreground"]!, border: tokens.border!,
    chart2: tokens["chart-2"]!,
    variables: Object.fromEntries(Object.entries(all).map(([name, value]) => [`--${name}`, value])) as Colors["variables"],
  };
  cache.set(key, colors);
  return colors;
}

export const ColorsContext = createContext<Colors>(buildColors("t3-code", "dark"));
/** The current colours as plain values. */
export const useColors = () => useContext(ColorsContext);
