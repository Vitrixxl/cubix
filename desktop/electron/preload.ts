import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("cubix", {
  ready: () => ipcRenderer.invoke("app:ready"),
  startup: () => ipcRenderer.invoke("app:startup"),
  availableUpdate: () => ipcRenderer.invoke("update:available"),
  restartUpdate: (id: string) => ipcRenderer.invoke("update:restart", id),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  call: (method: string, ...args: unknown[]) =>
    ipcRenderer.invoke("engine:call", method, args),
  open: (url: string) => ipcRenderer.invoke("external:open", url),
  onEvent: (callback: (event: unknown) => void) => {
    const handler = (_: unknown, event: unknown) => callback(event);
    ipcRenderer.on("engine:event", handler);
    return () => ipcRenderer.removeListener("engine:event", handler);
  },
});
