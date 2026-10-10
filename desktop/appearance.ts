import {DEFAULT_THEME, THEMES, themeTokens, type ThemeId} from '../src/client/lib/theme';
/** Dark, light, or whichever the system asks for. */
export type ColorMode = 'dark' | 'light' | 'system';
export type Appearance = {themeName: string; mode: ColorMode; light: boolean};
/** Whether the system asks for a light look; dark where there is no window to ask (tests). */
export const systemLight = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;
/** Preferences are JSON strings in the engine's local storage, not Electron localStorage. */
export function appearanceFromStorage(storage: Record<string, unknown>): Appearance {
  function preference(key: string) {
    try { return JSON.parse(String(storage[key])); } catch { return undefined; }
  }
  const name = preference('cubix.ui.theme'),
    stored = preference('cubix.ui.colorMode'),
    mode: ColorMode = stored === 'light' || stored === 'system' ? stored : 'dark';
  return {
    themeName: THEMES.some(theme => theme.id === name) ? name : DEFAULT_THEME,
    mode,
    light: mode === 'system' ? systemLight() : mode === 'light',
  };
}

/**
 * A copy of the choice in this window's localStorage, so the page is drawn in it from the first frame (boot.ts) while
 * the preferences load; never the default theme then the chosen one.
 */
const CACHED = 'cubix.appearance';
export function cachedAppearance(): Appearance {
  try { return appearanceFromStorage(JSON.parse(localStorage.getItem(CACHED) ?? '{}')); } catch { return appearanceFromStorage({}); }
}
export function cacheAppearance(themeName: string, mode: ColorMode) {
  try { localStorage.setItem(CACHED, JSON.stringify({'cubix.ui.theme': JSON.stringify(themeName), 'cubix.ui.colorMode': JSON.stringify(mode)})); } catch {}
}

/**
 * The accent and the mode on the document root (`themeTokens`, shared with the Android app), so the popups Base UI
 * portals into <body> inherit them too. Dark or light is the `dark` class.
 */
export function paintTheme(name: string, light: boolean) {
  const id = (THEMES.some(t => t.id === name) ? name : DEFAULT_THEME) as ThemeId;
  const root = document.documentElement;
  root.classList.toggle('dark', !light);
  root.style.colorScheme = light ? 'light' : 'dark';
  const tokens = themeTokens(id, light ? 'light' : 'dark');
  for (const [key, value] of Object.entries(tokens)) root.style.setProperty('--' + key, value);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.background!);
  return id;
}
