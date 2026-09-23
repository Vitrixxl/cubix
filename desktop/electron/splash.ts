import { app, BrowserWindow } from "electron";
import { createInterface } from "node:readline";
if (process.env.CUBIX_SPLASH_DATA) app.setPath("userData", process.env.CUBIX_SPLASH_DATA);
app.setName("Cubix startup");
let window: BrowserWindow;
let message = "Recherche de mises à jour…";
app.whenReady().then(async () => {
  window = new BrowserWindow({
    width: 380,
    height: 260,
    frame: false,
    resizable: false,
    center: true,
    backgroundColor: "#0b0b0e",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await window.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(
        `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{margin:0;background:#0b0b0e;color:#eef0f5;font:14px system-ui;display:grid;place-content:center;height:100vh;text-align:center}h1{font-size:28px;margin:0 0 26px}.spinner{width:24px;height:24px;border:3px solid #262630;border-top-color:#3987e5;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 18px}@keyframes spin{to{transform:rotate(360deg)}}p{color:#a9adba}</style><h1>Cubix</h1><div class="spinner"></div><p id="status">Recherche de mises à jour…</p>`,
      ),
  );
  await window.webContents.executeJavaScript(
    `document.getElementById('status').textContent=${JSON.stringify(message)}`,
  );
});
createInterface({ input: process.stdin })
  .on("line", (line) => {
    try {
      message = JSON.parse(line).message;
      if (window && !window.isDestroyed())
        void window.webContents.executeJavaScript(
          `document.getElementById('status').textContent=${JSON.stringify(message)}`,
        );
    } catch {}
  })
  .on("close", () => app.quit());

if (process.platform === "linux" && !process.env.WAYLAND_DISPLAY)
  app.commandLine.appendSwitch("ozone-platform", "x11");
