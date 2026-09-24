import type {Appearance} from './appearance';
/** `checking` while the launcher verifies and installs updates; `opening` once the application is about to start. */
export type StartupPhase = 'checking' | 'opening';
/** Why the launcher opened the installed version without updating; the application shows it in a toast. */
export type StartupNotice = 'offline' | 'update-failed';
export type LauncherState = Appearance & {message: string; phase: StartupPhase};
export type LauncherBridge = {
  state(): Promise<LauncherState>;
  onState(callback: (state: LauncherState) => void): () => void;
  /** The window is painted with the saved appearance and real fonts. */
  ready(): void;
  /** The cube stands assembled; the launcher may open the application. */
  settled(): void;
  /** The cuber closed the window before the application started. */
  close(): void;
};
