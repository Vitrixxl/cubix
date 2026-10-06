/** Builds the web app into dist/web: the Rust API serves it, the desktop app loads it from there.
 *
 *   /                      landing.html: the landing page, rendered here (desktop/renderer/landing)
 *   /timer, /learn…        index.html, the app (never cached by HTTP, network-first in the service worker)
 *   /install.sh, .ps1      the desktop installers (desktop/install); robots.txt, sitemap.xml, llms.txt
 *   /build/*               bundles with a content hash in their name, immutable
 *   /vendor/cubing-<v>/*   cubing.js modules for the scramblers, immutable per version
 *   /assets/*              icons and case diagrams
 */
import { cp, mkdir, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";
import type { BunPlugin } from "bun";
import { compile, Features } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { copyCubing } from "./vendor";

const root = resolve(import.meta.dir, "..");
process.chdir(root);
export const WEB_DIR = resolve(root, "dist/web");

/** Tailwind for Bun.build: each imported stylesheet that uses Tailwind is compiled with the classes found in its
 * `@source` paths (or the whole project without `source(…)`); other stylesheets go to Bun's own CSS loader. */
export const tailwind: BunPlugin = {
  name: "tailwind",
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async ({ path }) => {
      const compiler = await compile(await Bun.file(path).text(), { base: dirname(path), shouldRewriteUrls: true, onDependency() {} });
      if (!(compiler.features & (Features.AtApply | Features.JsPluginCompat | Features.ThemeFunction | Features.Utilities))) return undefined;
      const scope = compiler.root === "none" ? [] : [compiler.root === null ? { base: root, pattern: "**/*" } : compiler.root];
      const scanner = new Scanner({ sources: [...scope.map((source) => ({ ...source, negated: false })), ...compiler.sources] });
      const candidates = compiler.features & Features.Utilities ? scanner.scan() : [];
      return { contents: compiler.build(candidates), loader: "css" };
    });
  },
};

/** `devTools`: the development build, with the virtual smart cube at /dev/cube (desktop/renderer/dev); never deployed. */
export async function buildWeb(out = WEB_DIR, { devTools = false } = {}) {
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, "build"), { recursive: true });
  const production = { "process.env.NODE_ENV": '"production"', CUBIX_DEV: String(devTools) };
  const naming = { entry: "[name]-[hash].[ext]", chunk: "[name]-[hash].[ext]", asset: "[name]-[hash].[ext]" };
  const entries: string[] = [];
  const bundle = async (entrypoint: string, define: Record<string, string> = {}, splitting = false) => {
    const result = await Bun.build({ entrypoints: [entrypoint], outdir: join(out, "build"), target: "browser", minify: true, splitting, naming, plugins: [tailwind], define: { ...production, ...define } });
    if (!result.success) throw new AggregateError(result.logs, `Build failed: ${entrypoint}`);
    const url = (output: { path: string }) => "/" + relative(out, output.path).replaceAll("\\", "/");
    entries.push(...result.outputs.filter((output) => output.kind === "entry-point").map(url));
    return result.outputs.map(url);
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
  // Split: the app and the administration (/admin) are chunks of their own, each page loads only its own code.
  const app = await bundle("desktop/renderer/main.tsx", { CUBIX_WORKER: JSON.stringify(worker), CUBIX_VENDOR: JSON.stringify(`${vendor}/cubing`) }, true);
  // Only the entry: it imports its chunks itself.
  const scripts = app.filter((path) => path.endsWith(".js") && entries.includes(path) && basename(path).startsWith("main-"));
  const styles = app.filter((path) => path.endsWith(".css"));
  const html = (await readFile("desktop/renderer/index.html", "utf8"))
    .replace("<!-- styles -->", styles.map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n    "))
    .replace("<!-- scripts -->", scripts.map((src) => `<script type="module" src="${src}"></script>`).join("\n    "));
  await writeFile(join(out, "index.html"), html);
  await landing(out, bundle);
  await legal(out, bundle);
  if (devTools) {
    // Outside the precache: the page is only served by the development server (desktop/dev.ts).
    const page = await bundle("desktop/renderer/dev/virtualCube.tsx");
    await writeFile(join(out, "dev-cube.html"), (await readFile("desktop/renderer/dev/cube.html", "utf8"))
      .replace("<!-- styles -->", page.filter((path) => path.endsWith(".css")).map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n    "))
      .replace("<!-- scripts -->", page.filter((path) => path.endsWith(".js")).map((src) => `<script type="module" src="${src}"></script>`).join("\n    ")));
  }
  for (const name of ["manifest.webmanifest", "favicon.svg", "icon-192.png", "icon-512.png"]) await cp(join("desktop/renderer/pwa", name), join(out, name));
  for (const directory of ["icons", "cases"]) await cp(join("desktop/assets", directory), join(out, "assets", directory), { recursive: true });
  // Everything the app needs to open offline, scramblers included: the engine worker starts before the
  // service worker controls a first visit. Case diagrams are kept once shown.
  const icons = (await readdir(join(out, "assets/icons"))).map((name) => `/assets/icons/${name}`);
  // The administration is never used offline.
  const precache = ["/timer", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png", worker, ...app.filter((path) => !basename(path).startsWith("admin-")), ...icons, ...vendorFiles];
  // Named after the content, so any changed file installs a new shell cache.
  const hasher = new Bun.CryptoHasher("sha256");
  for (const url of precache) hasher.update(url).update(await readFile(join(out, url === "/timer" ? "index.html" : url)));
  const version = hasher.digest("hex").slice(0, 16);
  const sw = await Bun.build({ entrypoints: ["desktop/renderer/sw.ts"], target: "browser", minify: true, define: { CUBIX_VERSION: JSON.stringify(version), CUBIX_PRECACHE: JSON.stringify(precache) } });
  if (!sw.success) throw new AggregateError(sw.logs, "Build failed: service worker");
  await writeFile(join(out, "sw.js"), await sw.outputs[0].text());
  await compress(out);
  return { version };
}

/**
 * The landing page at the root, rendered to HTML here so it reads whole without JavaScript, then hydrated; the files
 * search engines and language models look for beside it; the desktop installers it gives; its screenshots and its
 * social image.
 */
async function landing(out: string, bundle: (entry: string) => Promise<string[]>) {
  const { createElement } = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { Landing } = await import("./renderer/landing/Landing");
  const { landingDocument, llms, llmsFull, robots, sitemap } = await import("./renderer/landing/document");
  const { DEFAULT_THEME, themeTokens } = await import("../src/client/lib/theme");
  const outputs = await bundle("desktop/renderer/landing/main.tsx");
  await writeFile(join(out, "landing.html"), landingDocument({
    body: renderToString(createElement(Landing)),
    theme: themeTokens(DEFAULT_THEME, "dark"),
    styles: outputs.filter((path) => path.endsWith(".css")),
    scripts: outputs.filter((path) => path.endsWith(".js") && basename(path).startsWith("main-")),
  }));
  await writeFile(join(out, "robots.txt"), robots());
  await writeFile(join(out, "sitemap.xml"), sitemap(new Date().toISOString().slice(0, 10)));
  await writeFile(join(out, "llms.txt"), llms());
  await writeFile(join(out, "llms-full.txt"), llmsFull());
  for (const name of ["install.sh", "install.ps1"]) await cp(join("desktop/install", name), join(out, name));
  // Screenshots and the social image, taken by desktop/scripts/landing-shots.ts (the image build has no sharp).
  await cp("desktop/assets/landing", join(out, "assets/landing"), { recursive: true });
  await cp("desktop/assets/landing/og.png", join(out, "og.png"));
}

/** The legal notice, the privacy policy and the terms of use, each written to HTML in French, then hydrated. */
async function legal(out: string, bundle: (entry: string) => Promise<string[]>) {
  const { createElement } = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { LegalPage } = await import("./renderer/legal/LegalPage");
  const { LEGAL_DOCUMENTS } = await import("./renderer/legal/paths");
  const { DOCUMENTS } = await import("./renderer/legal/documents");
  const { legalDocument } = await import("./renderer/legal/document");
  const { DEFAULT_THEME, themeTokens } = await import("../src/client/lib/theme");
  const outputs = await bundle("desktop/renderer/legal/main.tsx");
  for (const { id, path } of LEGAL_DOCUMENTS)
    await writeFile(join(out, path.slice(1) + ".html"), legalDocument({
      title: DOCUMENTS[id].fr.title,
      path,
      body: renderToString(createElement(LegalPage, { id })),
      theme: themeTokens(DEFAULT_THEME, "dark"),
      styles: outputs.filter((file) => file.endsWith(".css")),
      scripts: outputs.filter((file) => file.endsWith(".js") && basename(file).startsWith("main-")),
    }));
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
