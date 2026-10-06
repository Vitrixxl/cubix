import {homedir} from 'node:os';
import {join} from 'node:path';
/** Windows keeps it in %APPDATA% (Cubix); Linux and macOS in the XDG data directory. */
export function desktopDataDirectory() {
  if (process.env.CUBIX_DESKTOP_DATA) return process.env.CUBIX_DESKTOP_DATA;
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData/Roaming'), 'Cubix');
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local/share'), 'cubix-desktop');
}
