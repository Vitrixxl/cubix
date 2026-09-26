/** Development: builds the web app and the Electron shell, serves the web app on 127.0.0.1:5180 with the
 * API proxied to CUBIX_API_ORIGIN (production by default), then opens Electron on it.
 * `bun desktop/dev.ts --web` serves it without opening Electron, for a browser. */
delete process.env.ELECTRON_RUN_AS_NODE;
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { buildWeb, WEB_DIR } from "./web";
process.chdir(resolve(import.meta.dir, ".."));
// Separate from the installed app: its own window lock, browser storage and former storage.json.
process.env.CUBIX_DESKTOP_DATA ??= join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"), "cubix-desktop-dev");
const upstream = (process.env.CUBIX_API_ORIGIN ?? "https://cubix.vitrixxl.fr").replace(/\/$/, "");
await buildWeb();
type Socket = { upstream: WebSocket; pending: (string | Buffer)[] };
const server = Bun.serve<Socket>({
  hostname: "127.0.0.1",
  port: Number(process.env.CUBIX_DEV_PORT ?? 5180),
  async fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const socket = new WebSocket(upstream.replace(/^http/, "ws") + url.pathname);
        return server.upgrade(request, { data: { upstream: socket, pending: [] } }) ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
      }
      const headers = new Headers(request.headers);
      headers.delete("host");
      return fetch(upstream + url.pathname + url.search, { method: request.method, headers, body: request.body, redirect: "manual" })
        .catch(() => new Response(JSON.stringify({ error: "API unavailable" }), { status: 502 }));
    }
    const path = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    if (path.split("/").includes("..")) return new Response("Invalid path", { status: 400 });
    const file = Bun.file(WEB_DIR + path);
    return (await file.exists()) ? new Response(file, { headers: { "cache-control": "no-cache" } }) : new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      const { upstream: socket, pending } = ws.data;
      socket.onopen = () => { for (const message of pending.splice(0)) socket.send(message); };
      socket.onmessage = (event) => ws.send(event.data);
      socket.onclose = () => ws.close();
      socket.onerror = () => ws.close(1011, "API WebSocket unavailable");
    },
    message(ws, message) {
      const { upstream: socket, pending } = ws.data;
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
      else pending.push(message);
    },
    close(ws) { ws.data.upstream.close(); },
  },
});
const origin = `http://127.0.0.1:${server.port}`;
console.log(`Cubix web: ${origin} (API: ${upstream})`);
if (process.argv.includes("--web")) await new Promise(() => {});
const build = Bun.spawn(["bun", "desktop/build.ts"], { stdout: "inherit", stderr: "inherit" });
if (await build.exited) process.exit(1);
if (!(await Bun.file("node_modules/electron/path.txt").exists())) {
  const install = Bun.spawn(["bun", "node_modules/electron/install.js"], { stdout: "inherit", stderr: "inherit" });
  if (await install.exited) process.exit(1);
}
const electron = resolve(
  "node_modules/electron/dist",
  process.platform === "win32" ? "electron.exe" : process.platform === "darwin" ? "Electron.app/Contents/MacOS/Electron" : "electron",
);
const child = Bun.spawn([electron, "desktop/dist"], {
  env: { ...process.env, CUBIX_WEB_ORIGIN: origin },
  stdout: "inherit",
  stderr: "inherit",
});
const code = await child.exited;
server.stop(true);
process.exit(code);
