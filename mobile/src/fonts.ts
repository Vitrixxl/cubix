import { createContext, createElement, useContext, type ReactNode } from "react";
import { StyleSheet, unstable_TextAncestorContext as TextAncestorContext, type TextStyle } from "react-native";
import { FONT, ThemeContext, fontFamilyFor } from "./theme";

/**
 * Geist and Geist Mono (the web app's fonts, desktop/assets/fonts) plus the WCA glyphs, loaded by
 * App.tsx with expo-font before the first screen. Each weight is its own family name, since Android
 * cannot pick a weight inside a runtime-loaded family.
 */
export const FONT_FILES = {
  "cubing-icons": require("../assets/fonts/cubing-icons.ttf"),
  Geist: require("../assets/fonts/Geist-Regular.ttf"),
  "Geist-Medium": require("../assets/fonts/Geist-Medium.ttf"),
  "Geist-SemiBold": require("../assets/fonts/Geist-SemiBold.ttf"),
  "Geist-Bold": require("../assets/fonts/Geist-Bold.ttf"),
  GeistMono: require("../assets/fonts/GeistMono-Regular.ttf"),
  "GeistMono-Medium": require("../assets/fonts/GeistMono-Medium.ttf"),
  "GeistMono-SemiBold": require("../assets/fonts/GeistMono-SemiBold.ttf"),
  "GeistMono-Bold": require("../assets/fonts/GeistMono-Bold.ttf"),
};

type Kind = "sans" | "mono" | null;
/** The Geist family a text run is in, so a nested `<Text>` that only changes the weight stays in it. */
const KindContext = createContext<Kind>("sans");

/** "sans"/"mono" for a family to resolve, "sans!"/"mono!" for an already resolved file, null for any other font. */
function classify(family: string | undefined): Kind | "sans!" | "mono!" | undefined {
  if (family === undefined) return undefined;
  if (family === FONT.sans || family === "System" || family === "sans-serif") return "sans";
  if (family === FONT.mono || family === "monospace") return "mono";
  if (family.startsWith(FONT.mono + "-")) return "mono!";
  if (family.startsWith(FONT.sans + "-")) return "sans!";
  return null;
}

/**
 * Resolves a text style to the loaded Geist file: `fontFamily` (none, FONT.sans or FONT.mono/"monospace")
 * plus `fontWeight` become one concrete family with a normal weight (no synthetic bold on Android).
 * Other families (the WCA glyph font) are left alone. Top-level texts default to the theme's text colour.
 */
function useGeist(style: unknown, children: ReactNode, textColor: string | null) {
  const nested = useContext(TextAncestorContext);
  const inherited = useContext(KindContext);
  const theme = useContext(ThemeContext);
  const flat = (StyleSheet.flatten(style as TextStyle) ?? {}) as TextStyle;
  const found = classify(flat.fontFamily);
  let kind: Kind, extra: TextStyle | null = null;
  if (found === "sans!" || found === "mono!") kind = found === "mono!" ? "mono" : "sans";
  else if (found === null) kind = null;
  else {
    kind = found ?? (nested ? inherited : "sans");
    // A nested run without its own family or weight inherits the parent's resolved file.
    if (kind && (found !== undefined || !nested || flat.fontWeight !== undefined)) {
      extra = { fontFamily: fontFamilyFor(flat.fontWeight, kind === "mono"), fontWeight: "normal" };
    }
  }
  if (textColor && !nested && flat.color === undefined) extra = { ...extra, color: theme.text };
  return {
    style: extra ? [style, extra] : style,
    children: kind !== inherited ? createElement(KindContext.Provider, { value: kind }, children) : children,
  };
}

let patched = false;
/**
 * Makes every `<Text>` and `<TextInput>` imported from "react-native" render in Geist, like the web
 * app's `body { font-family: Geist }`, without touching each call site: the lazy `Text` / `TextInput`
 * getters of the react-native entry object are replaced (the modules' own `default` exports are
 * read-only). Runs once, before the first render. (`Animated.Text` is not covered; none is used.)
 */
export function installGeist() {
  if (patched) return;
  patched = true;
  try { patchEntry(); } catch (error) { console.warn("Geist: Text patch failed", error); }
}
function patchEntry() {
  const entry = require("react-native");
  const BaseText = entry.Text;
  const GeistText = (props: { style?: unknown; children?: ReactNode }) => {
    const resolved = useGeist(props.style, props.children, "text");
    const next = { ...props, style: resolved.style, children: resolved.children };
    return typeof BaseText === "function" ? BaseText(next) : createElement(BaseText, next);
  };
  Object.assign(GeistText, BaseText, { displayName: "Text" });

  const BaseInput = entry.TextInput;
  const GeistInput = (props: { style?: unknown }) => {
    const resolved = useGeist(props.style, null, null);
    return createElement(BaseInput, { ...props, style: resolved.style });
  };
  Object.assign(GeistInput, BaseInput, { displayName: "TextInput" });

  for (const [name, value] of [["Text", GeistText], ["TextInput", GeistInput]] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(entry, name);
    if (descriptor && !descriptor.configurable) { console.warn(`Geist: react-native ${name} cannot be patched`); continue; }
    Object.defineProperty(entry, name, { configurable: true, enumerable: true, get: () => value });
  }
}
