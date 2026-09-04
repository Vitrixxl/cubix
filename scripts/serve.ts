/**
 * Production-style local server for browser use (no desktop shell):
 *   - rebuilds the React view into dist/view at startup (fast, keeps it in sync with the sources)
 *   - serves dist/view as static files (SPA fallback to index.html)
 *   - mounts the Elysia API under /api on the same origin
 *
 * Usage: bun run scripts/serve.ts [--port 47129] [--no-build]
 */
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createApi } from "../src/bun/api";
import { openDb } from "../src/bun/db";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist", "view");
const args = process.argv.slice(2);
const portArg = args.indexOf("--port");
const port = portArg >= 0 ? Number(args[portArg + 1]) : Number(process.env.PORT ?? 47129);

async function buildView() {
  rmSync(DIST, { recursive: true, force: true });
  const result = await Bun.build({
    entrypoints: [join(ROOT, "src/mainview/index.html")],
    outdir: DIST,
    minify: true,
    sourcemap: "linked",
    publicPath: "./",
    naming: { chunk: "[name]-[hash].[ext]", asset: "[name]-[hash].[ext]", entry: "[name].[ext]" },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("view build failed");
  }
}

/** Newest mtime among the view/shared sources (cheap: a few hundred stat calls). */
async function sourcesMtime(): Promise<number> {
  let latest = 0;
  for (const dir of ["src/mainview", "src/shared", "data"]) {
    for await (const rel of new Bun.Glob("**/*").scan({ cwd: join(ROOT, dir), onlyFiles: true })) {
      if (rel.startsWith("raw/")) continue;
      const m = (await Bun.file(join(ROOT, dir, rel)).stat()).mtimeMs;
      if (m > latest) latest = m;
    }
  }
  return latest;
}

let builtAt = 0;
async function ensureFresh() {
  const latest = await sourcesMtime();
  if (latest <= builtAt && existsSync(join(DIST, "index.html"))) return;
  const t0 = performance.now();
  await buildView();
  builtAt = Date.now();
  console.log(`view built in ${Math.round(performance.now() - t0)} ms`);
}

if (!args.includes("--no-build") || !existsSync(join(DIST, "index.html"))) await ensureFresh();
else builtAt = Date.now();

const db = openDb(process.env.CUBIX_DB);
const api = createApi(db);
const server = Bun.serve({
  port,
  hostname: process.env.CUBIX_HOST ?? "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api")) return api.handle(req);
    const path = decodeURIComponent(url.pathname);
    if (path !== "/" && !path.includes("..")) {
      const file = Bun.file(join(DIST, path));
      if (await file.exists()) return new Response(file, { headers: { "cache-control": "no-cache" } });
    }
    // SPA entry: rebuild first if any source changed since the last build (so a page reload always shows the latest code)
    await ensureFresh().catch((e) => console.error(e));
    return new Response(Bun.file(join(DIST, "index.html")), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  },
});

console.log(`Cubix: http://${server.hostname}:${server.port}  (db: ${db.path})`);
