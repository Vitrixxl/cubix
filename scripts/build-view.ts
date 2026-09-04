/**
 * Bundles the React webview (HTML entrypoint → dist/view) with Bun's bundler.
 * Electrobun copies dist/view into the app bundle as views/mainview (see electrobun.config.ts).
 */
import { rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const outdir = join(ROOT, "dist", "view");
rmSync(outdir, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [join(ROOT, "src/mainview/index.html")],
  outdir,
  minify: !process.argv.includes("--no-minify"),
  sourcemap: "linked",
  publicPath: "./",
  naming: { chunk: "[name]-[hash].[ext]", asset: "[name]-[hash].[ext]", entry: "[name].[ext]" },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(`view built → ${outdir} (${result.outputs.length} files)`);
