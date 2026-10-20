/** Development: builds the web app and serves it on 127.0.0.1:5180, for a browser, with the API proxied to
 * CUBIX_API_ORIGIN (production by default). A change to the sources builds it again and reloads the open pages. */
import { watch } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { brotliDecompressSync } from "node:zlib";
import { resolve } from "node:path";
import { WEB_DIR } from "./web";
import { splitLanguage } from "../src/client/lib/route";
process.chdir(resolve(import.meta.dir, ".."));
const upstream = (process.env.CUBIX_API_ORIGIN ?? "https://cubix.vitrixxl.fr").replace(/\/$/, "");
// Its own build directory when given, so two development servers (a test one beside the one in use) do not clash.
const WEB = process.env.CUBIX_DEV_WEB_DIR ? resolve(process.env.CUBIX_DEV_WEB_DIR) : WEB_DIR;
/** Builds beside the one served, in a process of its own so every module is read afresh, then takes its place: the
 * pages open meanwhile still find their files. Prerendering takes 3 processes at most, never every core. */
let child: Bun.Subprocess | undefined;
async function build() {
  const next = `${WEB}.next`;
  child = Bun.spawn([process.execPath, "desktop/web.ts", "--dev", next], { stdout: "inherit", stderr: "inherit", env: { CUBIX_PRERENDER_JOBS: "3", ...process.env } });
  if (await child.exited) throw new Error("The web build failed");
  await rm(WEB, { recursive: true, force: true });
  await rename(next, WEB);
}
// A build outlives no server: the next one would write the same directory.
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { child?.kill(); process.exit(); });
await build();
// Every page served gets this script (a file of its own: the pages' policy forbids inline ones): it reloads once the
// sources are built again.
const reloader = `<script src="/dev/reload.js"></script>`;
const reloading = (html: string) => new Response(html + reloader, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
/** A socket of the app proxied to the API, or one end of the virtual smart cube (desktop/renderer/dev/protocol.ts). */
type Socket = { upstream: WebSocket; pending: (string | Buffer)[] } | { role: "cube" | "app" | "reload" };
// The relay of the virtual cube: what the cube page says goes to every app tab, and the other way.
const relay = { cube: 0, app: 0 };
const server = Bun.serve<Socket>({
  hostname: "127.0.0.1",
  port: Number(process.env.CUBIX_DEV_PORT ?? 5180),
  async fetch(request, server) {
    const url = new URL(request.url);
    if (url.pathname === "/dev/reload.js")
      return new Response(`new WebSocket("ws://" + location.host + "/dev/reload").onmessage = () => location.reload();`, { headers: { "content-type": "text/javascript", "cache-control": "no-cache" } });
    if (url.pathname === "/dev/reload") return server.upgrade(request, { data: { role: "reload" } }) ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
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
      // A compressed answer goes on as it came: unpacked, it would still say gzip and the browser could not read it.
      return fetch(upstream + url.pathname + url.search, { method: request.method, headers, body: request.body, redirect: "manual", decompress: false })
        .catch(() => new Response(JSON.stringify({ error: "API unavailable" }), { status: 502 }));
    }
    // The administration is drawn by the same page (see go-api/web.go).
    const admin = url.pathname === "/admin" || url.pathname.startsWith("/admin/");
    // The app's addresses, under the prefix of their language but English's; a page written ahead of time first, as
    // go-api/web.go serves it.
    const { language = "en", path: inner } = splitLanguage(url.pathname);
    const app = /^\/(login|onboarding|timer|algorithms|training|duel|learn|coaching|community|tournaments|match|daily|profile|solve)(\/|$)/.test(inner);
    if (app) {
      const puzzle = url.searchParams.get("puzzle"), step = url.searchParams.get("step"), page = decodeURIComponent(inner.slice(1).replace(/\/$/, ""));
      const names = [...(puzzle ? [...(step ? [`${page}@${puzzle}~${step}`] : []), `${page}@${puzzle}`] : []), page];
      for (const name of names) {
        const file = Bun.file(`${WEB}/pages/${language}/${name}.html.br`);
        if (!name.split("/").includes("..") && (await file.exists())) return reloading(brotliDecompressSync(await file.bytes()).toString());
      }
    }
    // The root is the landing page (desktop/renderer/landing); the app lives under its own paths.
    // The legal pages are pages of their own (desktop/renderer/legal), like the landing page.
    const legal = ["/legal", "/privacy", "/terms"].includes(url.pathname) ? url.pathname + ".html" : "";
    const path = legal || decodeURIComponent(url.pathname === "/" ? "/landing.html" : admin || app ? "/index.html" : url.pathname === "/dev/cube" ? "/dev-cube.html" : url.pathname.replace(/\/$/, "/index.html"));
    if (path.split("/").includes("..")) return new Response("Invalid path", { status: 400 });
    const file = Bun.file(WEB + path);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return path.endsWith(".html") ? reloading(await file.text()) : new Response(file, { headers: { "cache-control": "no-cache" } });
  },
  websocket: {
    open(ws) {
      if ("role" in ws.data) {
        const { role } = ws.data;
        if (role === "reload") return void ws.subscribe(role);
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
      if ("role" in ws.data) return void (ws.data.role !== "reload" && server.publish(ws.data.role === "cube" ? "app" : "cube", message));
      const { upstream: socket, pending } = ws.data;
      if (socket.readyState === WebSocket.OPEN) socket.send(message);
      else pending.push(message);
    },
    close(ws) {
      if (!("role" in ws.data)) return ws.data.upstream.close();
      if (ws.data.role === "reload") return;
      relay[ws.data.role]--;
      if (ws.data.role === "cube") server.publish("app", JSON.stringify({ type: "cube", online: relay.cube > 0 }));
      server.publish("cube", JSON.stringify({ type: "apps", count: relay.app }));
    },
  },
});
// localhost, not 127.0.0.1: the address the WCA and Google know the development site by (.env.example).
const origin = `http://localhost:${server.port}`;
console.log(`Cubix web: ${origin} (API: ${upstream})\nVirtual smart cube: ${origin}/dev/cube`);

// A change to the sources: one build at a time, once they have been quiet for a moment, and another after it when they
// change meanwhile. The build itself writes nothing in these directories.
let building = false, again = false, quiet: Timer | undefined;
async function rebuild() {
  if (building) return void (again = true);
  building = true;
  do {
    again = false;
    const started = performance.now();
    try {
      await build();
      server.publish("reload", "reload");
      console.log(`Rebuilt in ${((performance.now() - started) / 1000).toFixed(1)} s, pages reloaded`);
    } catch (error) {
      console.error(error);
    }
  } while (again);
  building = false;
}
const changed = (_: string, file: string | null) => {
  if (file && /(^|\/)\.|~$/.test(file)) return;
  clearTimeout(quiet);
  quiet = setTimeout(rebuild, 300);
};
for (const directory of ["desktop/renderer", "desktop/assets", "desktop/guides", "src", "mobile/src", "mobile/assets"]) watch(directory, { recursive: true }, changed);
// The phone app's own files at its root (App.tsx, index.ts, global.css…), not its dependencies nor its native builds.
watch("mobile", changed);
