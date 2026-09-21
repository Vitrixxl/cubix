import { app, BrowserWindow, ipcMain, shell, Menu } from "electron";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { join } from "node:path";
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
    })
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    quitting = true;
    engine?.stdin?.end();
  });
}

if (process.platform === "linux" && !process.env.WAYLAND_DISPLAY)
  app.commandLine.appendSwitch("ozone-platform", "x11");
