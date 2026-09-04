/**
 * Browser dev mode: serves the React view with Bun's HTML bundler (HMR) and mounts the
 * Elysia API on the same origin. Useful to iterate on the UI without the desktop shell.
 *
 * Usage: bun run scripts/dev-web.ts [--port 5180]
 */
import index from "../src/mainview/index.html";
import { createApi } from "../src/bun/api";
import { openDb } from "../src/bun/db";

const portArg = process.argv.indexOf("--port");
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : Number(process.env.PORT ?? 5180);
const db = openDb(process.env.CUBIX_DB);
const api = createApi(db);

const server = Bun.serve({
  port,
  development: { hmr: true, console: true },
  routes: { "/": index },
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api")) return api.handle(req);
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Cubix web dev: http://localhost:${server.port}  (db: ${db.path})`);
