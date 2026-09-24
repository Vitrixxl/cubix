import {contextBridge, ipcRenderer} from 'electron';
import type {LauncherBridge, LauncherState} from '../launcher-state';
const bridge: LauncherBridge = {
  state: () => ipcRenderer.invoke('launcher:state'),
  onState: callback => {
    const listener = (_: unknown, state: LauncherState) => callback(state);
    ipcRenderer.on('launcher:state', listener);
    return () => ipcRenderer.removeListener('launcher:state', listener);
  },
  ready: () => ipcRenderer.send('launcher:ready'),
  settled: () => ipcRenderer.send('launcher:settled'),
  close: () => ipcRenderer.send('launcher:close'),
};
contextBridge.exposeInMainWorld('cubixLauncher', bridge);
