import {DEFAULT_THEME, THEMES} from '../src/client/lib/theme';
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
