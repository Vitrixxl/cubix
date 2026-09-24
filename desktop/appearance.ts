import {THEMES} from '../src/client/lib/theme';
export type Appearance = {themeName: string; light: boolean};
/** Preferences are JSON strings in the engine's local storage, not Electron localStorage. */
export function appearanceFromStorage(storage: Record<string, unknown>): Appearance {
  function preference(key: string) {
    try { return JSON.parse(String(storage[key])); } catch { return undefined; }
  }
  const name = preference('cubix.ui.theme');
  return {
    themeName: THEMES.some(theme => theme.id === name) ? name : 't3-code',
    light: preference('cubix.ui.colorMode') === 'light',
  };
}
