import { installLauncherBinary, refreshLauncher } from "../updater";
import { app, BrowserWindow, ipcMain, shell, Menu } from "electron";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync, writeFileSync } from "node:fs";

const root = app.getAppPath();
app.setName("Cubix");
if (process.platform === "linux") {
  app.setDesktopName("fr.vitrixxl.cubix.desktop");
  app.commandLine.appendSwitch("class", "Cubix");
}
let engine: ReturnType<typeof spawn>;
let window: BrowserWindow;
let sequence = 0;
let quitting = false;
let restarting = false;
let updateTimer: ReturnType<typeof setInterval> | undefined;
const launcher = process.env.CUBIX_LAUNCHER_PATH;
const releaseId = process.env.CUBIX_RELEASE_ID;
let announcedUpdate: string | null = null;
async function availableUpdate(): Promise<string | null> {
  if (!launcher || !releaseId || !existsSync(launcher)) return null;
  try {
    const base = dirname(launcher);
    const pointer = JSON.parse(await readFile(join(base, "current.json"), "utf8"));
    if (!/^[a-f0-9]{64}$/.test(pointer.id) || pointer.id === releaseId) return null;
    // current.json only changes after every file has been downloaded and verified.
    const next = JSON.parse(await readFile(join(base, "releases", pointer.id, "release.json"), "utf8"));
    const current = JSON.parse(await readFile(join(root, "../release.json"), "utf8"));
    return next.build > current.build ? pointer.id : null;
  } catch {
    return null;
  }
}
async function checkUpdate() {
  const id = await availableUpdate();
  if (id !== announcedUpdate) {
    announcedUpdate = id;
    notify({ event: "update", value: id });
  }
  return id;
}
const notify = (message: unknown) => {
  if (
    !quitting &&
    window &&
    !window.isDestroyed() &&
    !window.webContents.isDestroyed()
  )
    window.webContents.send("engine:event", message);
};
const pending = new Map<
  number,
  {
    resolve: (v: unknown) => void;
    reject: (e: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();
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
      // Legacy launchers receive the new startup updater through signed releases too.
      if (launcher && releaseId) {
        try {
          const manifest = JSON.parse(await readFile(join(root, "../release.json"), "utf8"));
          await refreshLauncher(dirname(launcher), { id: releaseId, manifest });
        } catch (error) { console.error("Launcher update:", error); }
      }
      engine = existsSync(
        join(
          root,
          process.platform === "win32" ? "cubix-engine.exe" : "cubix-engine",
        ),
      )
        ? spawn(
            join(
              root,
              process.platform === "win32"
                ? "cubix-engine.exe"
                : "cubix-engine",
            ),
            [],
            { env: process.env, stdio: ["pipe", "pipe", "inherit"] },
          )
        : spawn(
            process.env.CUBIX_BUN ?? "bun",
            [join(root, "engine/main.js")],
            { env: process.env, stdio: ["pipe", "pipe", "inherit"] },
          );
      createInterface({ input: engine.stdout! }).on("line", (line) => {
        try {
          const message = JSON.parse(line);
          if (message.event) {
            notify(message);
            return;
          }
          const request = pending.get(message.id);
          if (!request) return;
          clearTimeout(request.timeout);
          pending.delete(message.id);
          if (message.error) request.reject(new Error(message.error));
          else request.resolve(message.value);
        } catch {
          /* Ignore non-protocol diagnostics. */
        }
      });
      engine.on("error", (error) =>
        notify({
          event: "error",
          value: error.message,
        }),
      );
      engine.on("exit", () => {
        for (const request of pending.values()) {
          clearTimeout(request.timeout);
          request.reject(new Error("The data engine stopped. Restart Cubix."));
        }
        pending.clear();
        notify({
          event: "error",
          value: "The data engine stopped. Restart Cubix.",
        });
      });
      ipcMain.handle("engine:call", (event, method, args) => {
        if (
          event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame ||
          typeof method !== "string" ||
          !Array.isArray(args)
        )
          throw Error("Invalid engine request");
        return new Promise((resolve, reject) => {
          const id = ++sequence;
          const timeout = setTimeout(() => {
            pending.delete(id);
            reject(new Error("The data engine did not respond."));
          }, 120000);
          pending.set(id, { resolve, reject, timeout });
          engine.stdin!.write(JSON.stringify({ id, method, args }) + "\n");
        });
      });
      ipcMain.handle("app:ready", (event) => {
        if (
          event.sender === window.webContents &&
          process.env.CUBIX_LAUNCH_READY
        )
          writeFileSync(process.env.CUBIX_LAUNCH_READY, "ready");
      });
      const trusted = (event: Electron.IpcMainInvokeEvent) =>
        event.sender === window.webContents &&
        event.senderFrame === window.webContents.mainFrame;
      ipcMain.handle("app:startup", (event) => {
        if (!trusted(event)) throw Error("Invalid startup request");
        // Set by the launcher when it opened this version without updating.
        const notice = process.env.CUBIX_STARTUP_NOTICE;
        return { notice: notice === "offline" || notice === "update-failed" ? notice : null };
      });
      ipcMain.handle("update:available", (event) => {
        if (!trusted(event)) throw Error("Invalid update request");
        return checkUpdate();
      });
      ipcMain.handle("update:restart", async (event, id) => {
        if (!trusted(event)) throw Error("Invalid update request");
        if (restarting) return;
        if (!launcher || !id || id !== await availableUpdate())
          throw Error("Cette mise à jour n’est plus disponible.");
        if (pending.size) throw Error("Une opération est en cours. Réessaie dans un instant.");
        restarting = true;
        // Relaunch through the updater so the new release keeps startup checks and rollback.
        app.relaunch({ execPath: launcher, args: [] });
        setImmediate(() => app.quit());
      });
      ipcMain.handle("external:open", (_event, url) => {
        if (typeof url === "string" && /^https?:\/\//.test(url))
          return shell.openExternal(url);
      });
      window = new BrowserWindow({
        width: Number(process.env.CUBIX_WIDTH) || 1280,
        height: Number(process.env.CUBIX_HEIGHT) || 800,
        useContentSize: true,
        title: "Cubix",
        backgroundColor: "#0b0b0e",
        icon: join(root, "assets/icon.png"),
        show: false,
        webPreferences: {
          preload: join(root, "preload.cjs"),
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          spellcheck: false,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      window.on("app-command", (_event, command) => {
        if (command === "browser-backward" || command === "browser-forward")
          window.webContents.send("engine:event", { event: command });
      });
      await window.loadFile(join(root, "renderer/index.html"));
      window.show();
      // The launcher binary itself is large: bring it in quietly after startup, never during it.
      if (launcher && releaseId && existsSync(launcher))
        setTimeout(() => void (async () => {
          try {
            const base = dirname(launcher);
            const manifest = JSON.parse(await readFile(join(root, "../release.json"), "utf8"));
            const config = JSON.parse(await readFile(join(base, "launcher.json"), "utf8"));
            if (await installLauncherBinary(base, manifest, process.env.CUBIX_API_ORIGIN ?? config.origin))
              console.log("Launcher binary updated.");
          } catch (error) { console.error("Launcher binary update:", error); }
        })(), 5000);
      updateTimer = setInterval(() => { void checkUpdate(); }, 2000);
    })
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    quitting = true;
    clearInterval(updateTimer);
    engine?.stdin?.end();
  });
}

if (process.platform === "linux" && !process.env.WAYLAND_DISPLAY)
  app.commandLine.appendSwitch("ozone-platform", "x11");
