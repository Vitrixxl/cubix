/** The desktop app is the web app served by the API, opened in its own window. Its service worker keeps
 * it usable offline and every online launch opens the latest deployed version: there is no updater. */
import { app, BrowserWindow, ipcMain, shell, Menu, net } from "electron";
import { join } from "node:path";
import { existsSync, readFileSync, renameSync } from "node:fs";
import { desktopDataDirectory } from "../data-path";
import { electronLaunchOptions } from "../platform";

const root = app.getAppPath();
const origin = new URL(process.env.CUBIX_WEB_ORIGIN ?? process.env.CUBIX_API_ORIGIN ?? "https://cubix.vitrixxl.fr").origin;
const data = desktopDataDirectory();
// Browser storage (the web app's IndexedDB and offline cache) lives with the rest of Cubix's data.
app.setPath("userData", join(data, "electron"));
app.setName("Cubix");
if (process.platform === "linux") {
  app.setDesktopName("fr.vitrixxl.cubix.desktop");
  app.commandLine.appendSwitch("class", "Cubix");
}
const launch = electronLaunchOptions();
for (const [name, value] of launch.switches) app.commandLine.appendSwitch(name, value);
Object.assign(process.env, launch.env);

/** Solves, preferences and the session of the former Bun engine, imported once by the web app. */
const legacy = join(data, "storage.json");
let window: BrowserWindow;
let retry: ReturnType<typeof setInterval> | undefined;
const sameOrigin = (url: string) => { try { return new URL(url).origin === origin; } catch { return false; } };
const trusted = (event: Electron.IpcMainInvokeEvent) =>
  event.sender === window.webContents &&
  event.senderFrame === window.webContents.mainFrame &&
  sameOrigin(event.senderFrame.url);
const external = (url: string) => { if (/^https?:\/\//.test(url)) void shell.openExternal(url); };

/** Only a first launch without connection has nothing cached to show: wait for the server there. */
function offline() {
  if (retry) return;
  void window.loadFile(join(root, "offline.html"));
  retry = setInterval(() => {
    void net.fetch(origin, { method: "HEAD" }).then((response) => {
      if (!response.ok || !retry) return;
      clearInterval(retry);
      retry = undefined;
      void window.loadURL(origin);
    }).catch(() => {});
  }, 5000);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    window?.restore();
    window?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);
      ipcMain.handle("legacy:read", (event) => {
        if (!trusted(event)) throw Error("Invalid request");
        return existsSync(legacy) ? readFileSync(legacy, "utf8") : null;
      });
      ipcMain.handle("legacy:imported", (event) => {
        if (!trusted(event)) throw Error("Invalid request");
        // Kept aside rather than deleted, in case the import ever needs to be checked.
        if (existsSync(legacy)) renameSync(legacy, join(data, "storage.imported.json"));
      });
      ipcMain.handle("external:open", (event, url) => {
        if (trusted(event) && typeof url === "string") external(url);
      });
      window = new BrowserWindow({
        width: Number(process.env.CUBIX_WIDTH) || 1280,
        height: Number(process.env.CUBIX_HEIGHT) || 800,
        useContentSize: true,
        title: "Cubix",
        backgroundColor: "#0b0b0e",
        icon: join(root, "icon.png"),
        show: false,
        webPreferences: {
          preload: join(root, "preload.cjs"),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          spellcheck: false,
        },
      });
      window.webContents.setWindowOpenHandler(({ url }) => {
        external(url);
        return { action: "deny" };
      });
      window.webContents.on("will-navigate", (event, url) => {
        if (sameOrigin(url)) return;
        event.preventDefault();
        external(url);
      });
      window.webContents.on("did-fail-load", (_event, code, _description, url, mainFrame) => {
        // -3 is an aborted load, replaced by another navigation.
        if (mainFrame && code !== -3 && sameOrigin(url)) offline();
      });
      // Mouse back/forward: Windows only reports them as app commands; elsewhere the web app sees the
      // mouseup itself, and Linux would otherwise get both and travel twice.
      if (process.platform === "win32")
        window.on("app-command", (_event, command) => {
          if (command === "browser-backward" || command === "browser-forward")
            window.webContents.send("desktop:event", { event: command });
        });
      window.once("ready-to-show", () => window.show());
      await window.loadURL(origin).catch(() => {});
    })
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => clearInterval(retry));
}
