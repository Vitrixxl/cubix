/** Builds the web app into dist/web: the Rust API serves it, the desktop app loads it from there.
 *
 *   /                      index.html (never cached by HTTP, network-first in the service worker)
 *   /build/*               bundles with a content hash in their name, immutable
 *   /vendor/cubing-<v>/*   cubing.js modules for the scramblers, immutable per version
 *   /assets/*              icons and case diagrams
 */
import { cp, mkdir, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";
import { copyCubing } from "./vendor";

const root = resolve(import.meta.dir, "..");
process.chdir(root);
export const WEB_DIR = resolve(root, "dist/web");

export async function buildWeb(out = WEB_DIR) {
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, "build"), { recursive: true });
  const production = { "process.env.NODE_ENV": '"production"' };
  const naming = { entry: "[name]-[hash].[ext]", chunk: "[name]-[hash].[ext]", asset: "[name]-[hash].[ext]" };
  const bundle = async (entrypoint: string, define: Record<string, string> = {}) => {
    const result = await Bun.build({ entrypoints: [entrypoint], outdir: join(out, "build"), target: "browser", minify: true, naming, define: { ...production, ...define } });
    if (!result.success) throw new AggregateError(result.logs, `Build failed: ${entrypoint}`);
    return result.outputs.map((output) => "/" + relative(out, output.path).replaceAll("\\", "/"));
  };
  const { version: cubingVersion } = JSON.parse(await readFile("node_modules/cubing/package.json", "utf8"));
  const vendor = `/vendor/cubing-${cubingVersion}`;
  await copyCubing(join(out, vendor));
  const vendorFiles: string[] = [];
  for (const file of await readdir(join(out, vendor), { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue;
    const path = join(file.parentPath, file.name);
    if (!file.name.endsWith(".js")) await rm(path);
    else vendorFiles.push("/" + relative(out, path).replaceAll("\\", "/"));
  }
  const [worker] = await bundle("desktop/renderer/worker.ts", { CUBIX_VENDOR: JSON.stringify(`${vendor}/cubing`) });
  const app = await bundle("desktop/renderer/main.tsx", { CUBIX_WORKER: JSON.stringify(worker) });
  const scripts = app.filter((path) => path.endsWith(".js") && basename(path).startsWith("main-"));
  const styles = app.filter((path) => path.endsWith(".css"));
  const html = (await readFile("desktop/renderer/index.html", "utf8"))
    .replace("<!-- styles -->", styles.map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n    "))
    .replace("<!-- scripts -->", scripts.map((src) => `<script type="module" src="${src}"></script>`).join("\n    "));
  await writeFile(join(out, "index.html"), html);
  for (const name of ["manifest.webmanifest", "icon-192.png", "icon-512.png"]) await cp(join("desktop/renderer/pwa", name), join(out, name));
  for (const directory of ["icons", "cases"]) await cp(join("desktop/assets", directory), join(out, "assets", directory), { recursive: true });
  // Everything the app needs to open offline, scramblers included: the engine worker starts before the
  // service worker controls a first visit. Case diagrams are kept once shown.
  const icons = (await readdir(join(out, "assets/icons"))).map((name) => `/assets/icons/${name}`);
  const precache = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", worker, ...app, ...icons, ...vendorFiles];
  // Named after the content, so any changed file installs a new shell cache.
  const hasher = new Bun.CryptoHasher("sha256");
  for (const url of precache) hasher.update(url).update(await readFile(join(out, url === "/" ? "index.html" : url)));
  const version = hasher.digest("hex").slice(0, 16);
  const sw = await Bun.build({ entrypoints: ["desktop/renderer/sw.ts"], target: "browser", minify: true, define: { CUBIX_VERSION: JSON.stringify(version), CUBIX_PRECACHE: JSON.stringify(precache) } });
  if (!sw.success) throw new AggregateError(sw.logs, "Build failed: service worker");
  await writeFile(join(out, "sw.js"), await sw.outputs[0].text());
  await compress(out);
  return { version };
}

/** Precompressed copies the API serves when the browser accepts them; the Pi never compresses on the fly. */
async function compress(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await compress(path);
    else if (/\.(js|css|html|svg|json|webmanifest|ttf)$/.test(entry.name)) {
      const bytes = await readFile(path);
      if (bytes.length < 1024) continue;
      await writeFile(path + ".br", brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }));
      await writeFile(path + ".gz", gzipSync(bytes, { level: 9 }));
    }
  }
}

if (import.meta.main) {
  const { version } = await buildWeb();
  console.log(`Web app ${version} built in ${relative(root, WEB_DIR)}`);
}
