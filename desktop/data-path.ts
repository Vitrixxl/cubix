import {homedir} from 'node:os';
import {join} from 'node:path';
export function desktopDataDirectory() {
  return process.env.CUBIX_DESKTOP_DATA ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local/share'), 'cubix-desktop');
}
