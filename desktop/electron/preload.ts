import { contextBridge, ipcRenderer } from "electron";
/** The web app runs as in a browser; the shell only adds what a browser tab cannot do. */
contextBridge.exposeInMainWorld("cubixDesktop", {
  legacyStorage: () => ipcRenderer.invoke("legacy:read"),
  legacyImported: () => ipcRenderer.invoke("legacy:imported"),
  open: (url: string) => ipcRenderer.invoke("external:open", url),
  onEvent: (callback: (event: unknown) => void) => {
    const handler = (_: unknown, event: unknown) => callback(event);
    ipcRenderer.on("desktop:event", handler);
    return () => ipcRenderer.removeListener("desktop:event", handler);
  },
});
