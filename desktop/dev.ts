/** Development: builds the web app and the Electron shell, serves the web app on 127.0.0.1:5180 with the
 * API proxied to CUBIX_API_ORIGIN (production by default), then opens Electron on it.
 * `bun desktop/dev.ts --web` serves it without opening Electron, for a browser. */
delete process.env.ELECTRON_RUN_AS_NODE;
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { buildWeb, WEB_DIR } from "./web";
import { splitLanguage } from "../src/client/lib/route";
process.chdir(resolve(import.meta.dir, ".."));
// Separate from the installed app: its own window lock, browser storage and former storage.json.
process.env.CUBIX_DESKTOP_DATA ??= join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"), "cubix-desktop-dev");
const upstream = (process.env.CUBIX_API_ORIGIN ?? "https://cubix.vitrixxl.fr").replace(/\/$/, "");
// Its own build directory when given, so two development servers (a test one beside the one in use) do not clash.
const WEB = process.env.CUBIX_DEV_WEB_DIR ? resolve(process.env.CUBIX_DEV_WEB_DIR) : WEB_DIR;
await buildWeb(WEB, { devTools: true });
/** A socket of the app proxied to the API, or one end of the virtual smart cube (desktop/renderer/dev/protocol.ts). */
type Socket = { upstream: WebSocket; pending: (string | Buffer)[] } | { role: "cube" | "app" };
// The relay of the virtual cube: what the cube page says goes to every app tab, and the other way.
const relay = { cube: 0, app: 0 };
const server = Bun.serve<Socket>({
  hostname: "127.0.0.1",
  port: Number(process.env.CUBIX_DEV_PORT ?? 5180),
  async fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === "/dev/smartcube") {
      const role = url.searchParams.get("role");
      if (role !== "cube" && role !== "app") return new Response("Unknown role", { status: 400 });
      return server.upgrade(request, { data: { role } }) ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    }
    if (url.pathname.startsWith("/api/")) {
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const socket = new WebSocket(upstream.replace(/^http/, "ws") + url.pathname);
        return server.upgrade(request, { data: { upstream: socket, pending: [] } }) ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
      }
      const headers = new Headers(request.headers);
      headers.delete("host");
      // The administration only accepts requests from its own origin.
      if (headers.has("origin")) headers.set("origin", upstream);
      return fetch(upstream + url.pathname + url.search, { method: request.method, headers, body: request.body, redirect: "manual" })
        .catch(() => new Response(JSON.stringify({ error: "API unavailable" }), { status: 502 }));
    }
    // The administration is drawn by the same page (see go-api/web.go).
    const admin = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
    // The app's addresses, under the prefix of their language but English's; a page written ahead of time first, as
    // go-api/web.go serves it.
    const { language = "en", path: inner } = splitLanguage(url.pathname);
    const app = /^\/(login|onboarding|timer|algorithms|training|duel|learn|coaching|community|tournaments|match|profile|solve)(\/|$)/.test(inner);
    if (app) {
      const puzzle = url.searchParams.get("puzzle"), step = url.searchParams.get("step"), page = decodeURIComponent(inner.slice(1).replace(/\/$/, ""));
      const names = [...(puzzle ? [...(step ? [`${page}@${puzzle}~${step}`] : []), `${page}@${puzzle}`] : []), page];
      for (const name of names) {
        const file = Bun.file(`${WEB}/pages/${language}/${name}.html.br`);
        if (!name.split("/").includes("..") && (await file.exists()))
          return new Response(file, { headers: { "content-type": "text/html; charset=utf-8", "content-encoding": "br", "cache-control": "no-cache" } });
      }
    }
    // The root is the landing page (desktop/renderer/landing); the app lives under its own paths.
    // The legal pages are pages of their own (desktop/renderer/legal), like the landing page.
    const legal = ["/legal", "/privacy", "/terms"].includes(url.pathname) ? url.pathname + ".html" : "";
    const path = legal || decodeURIComponent(url.pathname === "/" ? "/landing.html" : admin || app ? "/index.html" : url.pathname === "/dev/cube" ? "/dev-cube.html" : url.pathname.replace(/\/$/, "/index.html"));
    if (path.split("/").includes("..")) return new Response("Invalid path", { status: 400 });
    const file = Bun.file(WEB + path);
    return (await file.exists()) ? new Response(file, { headers: { "cache-control": "no-cache" } }) : new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      if ("role" in ws.data) {
        const { role } = ws.data;
        relay[role]++;
        ws.subscribe(role);
        if (role === "app") ws.send(JSON.stringify({ type: "cube", online: relay.cube > 0 }));
        else server.publish("app", JSON.stringify({ type: "cube", online: true }));
        server.publish("cube", JSON.stringify({ type: "apps", count: relay.app }));
        return;
      }
      const { upstream: socket, pending } = ws.data;
      socket.onopen = () => { for (const message of pending.splice(0)) socket.send(message); };
      socket.onmessage = (event) => ws.send(event.data);
      socket.onclose = () => ws.close();
      socket.onerror = () => ws.close(1011, "API WebSocket unavailable");
    },
    message(ws, message) {
      if ("role" in ws.data) return void server.publish(ws.data.role === "cube" ? "app" : "cube", message);
      const { upstream: socket, pending } = ws.data;
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
      else pending.push(message);
    },
    close(ws) {
      if (!("role" in ws.data)) return ws.data.upstream.close();
      relay[ws.data.role]--;
      if (ws.data.role === "cube") server.publish("app", JSON.stringify({ type: "cube", online: relay.cube > 0 }));
      server.publish("cube", JSON.stringify({ type: "apps", count: relay.app }));
    },
  },
});
const origin = `http://127.0.0.1:${server.port}`;
console.log(`Cubix web: ${origin} (API: ${upstream})\nVirtual smart cube: ${origin}/dev/cube`);
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
