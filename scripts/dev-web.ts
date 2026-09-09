import { buildModelWorker } from "./build-model-worker";
import { buildVendor } from "./build-vendor";
await buildVendor();
import admin from "../src/admin/index.html";
import index from "../src/frontend/index.html";
import { WebSocket } from "ws";

// Development-only proxy: API traffic and authentication remain on the Rust server.
type Bridge = { upstream: WebSocket; pending: (string | Buffer)[] };
const upstreamOrigin = "http://127.0.0.1:47129";
const server = Bun.serve<Bridge>({
  hostname: "127.0.0.1",
  port: 5180,
  development: { hmr: true, console: true },
  routes: {
    "/aaaaadmin": admin,
    "/aaaaadmin/": admin,
    "/api/*": async (request: Request, server: Bun.Server<Bridge>) => {
      const url = new URL(request.url);
      if (["/api/social/live", "/api/admin/live"].includes(url.pathname) && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const upstream = new WebSocket(upstreamOrigin.replace("http:", "ws:") + url.pathname, {
          maxPayload: url.pathname === "/api/admin/live" ? 1024 * 1024 : 16 * 1024,
          headers: { host: request.headers.get("host") ?? url.host, ...(request.headers.has("origin") ? { origin: request.headers.get("origin")! } : {}), ...(request.headers.has("cookie") ? { cookie: request.headers.get("cookie")! } : {}) },
        });
        // Registered immediately so connection failures cannot become unhandled errors.
        upstream.on("error", () => {});
        if (server.upgrade(request, { data: { upstream, pending: [] } })) return;
        upstream.terminate();
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      try {
        return await fetch(new Request(upstreamOrigin + url.pathname + url.search, request), { redirect: "manual" });
      } catch {
        return new Response("Rust API unavailable", { status: 502 });
      }
    },
    "/vendor/cubing/*": async (request: Request) => {
      const path = decodeURIComponent(new URL(request.url).pathname.slice("/vendor/cubing/".length));
      if (path.split("/").includes("..") || path.includes("\\")) return new Response("Invalid path", { status: 400 });
      const file = Bun.file(`build/vendor/cubing/${path}`);
      return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
    },
    "/workers/puzzle-model.js": async () => {
      await buildModelWorker();
      return new Response(Bun.file("build/workers/puzzle-model.js"),{headers:{"Cache-Control":"no-store"}});
    },
    "/cases/*": async (request: Request) => {
      const name = new URL(request.url).pathname.slice("/cases/".length);
      if (!/^[a-z0-9-]+\.svg$/.test(name)) return new Response("Not found", {status:404});
      const file = Bun.file(`public/cases/${name}`);
      return await file.exists() ? new Response(file) : new Response("Not found", {status:404});
    },
    "/pwa/*": async (request: Request) => {
      const path = new URL(request.url).pathname;
      const file = Bun.file(`public${path}`);
      return await file.exists() ? new Response(file) : new Response("Not found", { status: 404 });
    },
    "/*": index,
  },
  websocket: {
    maxPayloadLength: 16 * 1024,
    open(socket) {
      const { upstream, pending } = socket.data;
      upstream.on("open", () => { for (const message of pending.splice(0)) upstream.send(message); });
      upstream.on("message", (message, binary) => socket.send(binary ? message as Buffer : message.toString()));
      upstream.on("close", (code, reason) => socket.close(code === 1006 ? 1011 : code, reason.toString()));
      upstream.on("error", () => socket.close(1011, "Rust WebSocket unavailable"));
    },
    message(socket, message) {
      const { upstream, pending } = socket.data;
      if (upstream.readyState === WebSocket.OPEN) upstream.send(message);
      else if (upstream.readyState === WebSocket.CONNECTING && pending.length < 16) pending.push(message);
      else socket.close(1011, "Rust WebSocket unavailable");
    },
    close(socket) {
      socket.data.pending.length = 0;
      socket.data.upstream.terminate();
    },
  },
});
console.log(`Cubix frontend (Bun HMR): ${server.url}`);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { server.stop(true); process.exit(0); });
