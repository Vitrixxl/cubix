/**
 * The startup window: the same React primitives, stylesheet, fonts, theme and colour mode as the
 * application, showing the shared startup cube while the launcher verifies updates. The launcher
 * process feeds status lines on stdin; the window answers `ready`, `settled` and `cancel` on stdout.
 */
import {app, BrowserWindow, Menu, ipcMain, nativeTheme} from 'electron';
import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {desktopDataDirectory} from '../data-path';
import {appearanceFromStorage} from '../appearance';
import {theme} from '../renderer/theme';
import type {LauncherState} from '../launcher-state';
if (process.env.CUBIX_SPLASH_DATA) app.setPath('userData', process.env.CUBIX_SPLASH_DATA);
app.setName('Cubix startup');
let window: BrowserWindow | undefined;
let state: LauncherState = {themeName: 't3-code', light: false, message: 'Recherche de mises à jour…', phase: 'checking'};
let shown = false;
const reply = (line: string) => { try { process.stdout.write(line + '\n'); } catch {} };
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    const values = JSON.parse(await readFile(join(desktopDataDirectory(), 'storage.json'), 'utf8'));
    state = {...state, ...appearanceFromStorage(values)};
  } catch {} // A new installation or a damaged preference file uses the same app defaults.
  nativeTheme.themeSource = state.light ? 'light' : 'dark';
  const resources = join(app.getAppPath(), 'launcher');
  window = new BrowserWindow({
    title: 'Cubix', width: 560, height: 430, useContentSize: true,
    resizable: false, center: true, show: false,
    backgroundColor: theme(state.themeName, state.light)['--bg'],
    icon: join(resources, 'assets/icon.png'),
    webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false, preload: join(resources, 'preload.cjs')},
  });
  const trusted = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => event.sender === window?.webContents;
  ipcMain.handle('launcher:state', event => trusted(event) ? state : undefined);
  ipcMain.on('launcher:ready', event => {
    if (!trusted(event) || shown) return;
    shown = true;
    window!.show();
    window!.webContents.send('launcher:state', state);
    reply('ready');
  });
  ipcMain.on('launcher:settled', event => { if (trusted(event)) reply('settled'); });
  ipcMain.on('launcher:close', event => {
    if (!trusted(event)) return;
    reply('cancel');
    window!.close();
  });
  await window.loadFile(join(resources, 'renderer/index.html'));
}).catch(error => { console.error(error); app.exit(1); });
createInterface({input: process.stdin}).on('line', line => {
  try {
    const value = JSON.parse(line);
    if (typeof value.message !== 'string') return;
    state = {...state, message: value.message.slice(0, 350), phase: value.phase === 'opening' ? 'opening' : 'checking'};
    if (shown && window && !window.isDestroyed()) window.webContents.send('launcher:state', state);
  } catch {}
}).on('close', () => app.quit());
app.on('window-all-closed', () => app.quit());
if (process.platform === 'linux' && !process.env.WAYLAND_DISPLAY) app.commandLine.appendSwitch('ozone-platform', 'x11');
