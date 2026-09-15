/**
 * Mini API serving the latest built APK over the local network, so a phone can install it
 * without GitHub or the production server. `bun scripts/serve-apk.ts [--port=8790] [--file=…]`.
 *   GET /            → HTML page with a download link
 *   GET /cubix.apk   → the APK (Content-Disposition: attachment)
 *   GET /release     → { file, size, modified } for scripting
 */
import { statSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const argument = (name: string) => process.argv.find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const port = Number(argument("port") ?? 8790);
const file = resolve(root, argument("file") ?? "build/cubix-release-arm64.apk");
const info = () => { const s = statSync(file); return { file, size: s.size, modified: s.mtime.toISOString() }; };

Bun.serve({
  hostname: "0.0.0.0", port,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/release") return Response.json(info());
    if (pathname === "/cubix.apk") return new Response(Bun.file(file), { headers: { "Content-Type": "application/vnd.android.package-archive", "Content-Disposition": 'attachment; filename="cubix.apk"', "Cache-Control": "no-store" } });
    if (pathname === "/") {
      const { size, modified } = info();
      return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>Cubix APK</title>
<body style="font-family:system-ui;padding:24px;background:#0b0b0e;color:#eee"><h1>Cubix</h1>
<p>${(size / 1048576).toFixed(1)} MB · ${modified}</p><p><a href="/cubix.apk" style="color:#8ab4ff;font-size:20px">Download cubix.apk</a></p></body>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    return new Response("Not found", { status: 404 });
  },
});
const addresses = Object.values(networkInterfaces()).flat().filter(a => a && a.family === "IPv4" && !a.internal).map(a => a!.address);
console.log(`Serving ${file}\n${addresses.map(a => `  http://${a}:${port}/cubix.apk`).join("\n")}`);
