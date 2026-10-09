/** Builds the web app into dist/web: the API serves it, the desktop app loads it from there.
 *
 *   /                      landing.html: the landing page, rendered here (desktop/renderer/landing)
 *   /timer, /learn…        index.html, the app (never cached by HTTP, network-first in the service worker); its public
 *                          pages written ahead of time in every language under pages/ (desktop/prerender.tsx)
 *   /install.sh, .ps1      the desktop installers (desktop/install); robots.txt, sitemap.xml, llms.txt
 *   /build/*               bundles and fonts with a content hash in their name, immutable
 *   /vendor/cubing-<v>/*   cubing.js modules for the scramblers, immutable per version
 *   /assets/*              icons and case diagrams
 */
import { cp, mkdir, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";
import type { BuildOutput, BunPlugin } from "bun";
import { compile, Features } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { copyCubing } from "./vendor";
import { buildPages } from "./prerender";

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

/** An entry's build: `files`, every output; `entry`, its script; `meta`, what each output imports. */
type Bundle = { files: string[]; entry: string; meta: NonNullable<BuildOutput["metafile"]> };
/** The scripts of `sources` (modules of the bundle) with every chunk they import at once: what a page fetches
 * before it runs, for `modulepreload`. */
function chunks({ meta }: Bundle, sources: string[]) {
  const found = new Set<string>();
  const visit = (file: string) => {
    if (found.has(file)) return;
    found.add(file);
    for (const { path, kind } of meta.outputs[file]?.imports ?? []) if (kind === "import-statement") visit(path);
  };
  for (const [file, output] of Object.entries(meta.outputs)) if (output.entryPoint && sources.includes(output.entryPoint)) visit(file);
  return [...found].map((file) => "/build/" + file.replace(/^\.\//, ""));
}

/** `devTools`: the development build, with the virtual smart cube at /dev/cube (desktop/renderer/dev); never deployed. */
export async function buildWeb(out = WEB_DIR, { devTools = false } = {}) {
  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, "build"), { recursive: true });
  const production = { "process.env.NODE_ENV": '"production"', CUBIX_DEV: String(devTools) };
  const naming = { entry: "[name]-[hash].[ext]", chunk: "[name]-[hash].[ext]", asset: "[name]-[hash].[ext]" };
  // The fonts (desktop/scripts/subset-fonts.ts), named after their content: the stylesheet links them rather than
  // inlining them, so they download in parallel and only the weights a page draws.
  const fonts = new Map<string, string>();
  for (const name of await readdir("desktop/assets/fonts")) {
    if (!name.endsWith(".woff2")) continue;
    const bytes = await readFile(join("desktop/assets/fonts", name));
    const url = `/build/${basename(name, ".woff2")}-${new Bun.CryptoHasher("sha256").update(bytes).digest("hex").slice(0, 8)}.woff2`;
    await writeFile(join(out, url), bytes);
    fonts.set(name, url);
  }
  const linked: BunPlugin = {
    name: "fonts",
    setup(build) {
      build.onResolve({ filter: /\.woff2$/ }, ({ path }) => {
        const url = fonts.get(basename(path));
        if (!url) throw new Error(`Unknown font ${path}: run desktop/scripts/subset-fonts.ts`);
        return { path: url, external: true };
      });
    },
  };
  const bundle = async (entrypoint: string, define: Record<string, string> = {}, splitting = false): Promise<Bundle> => {
    const result = await Bun.build({ entrypoints: [entrypoint], outdir: join(out, "build"), target: "browser", minify: true, splitting, naming, plugins: [tailwind, linked], metafile: true, define: { ...production, ...define } });
    if (!result.success) throw new AggregateError(result.logs, `Build failed: ${entrypoint}`);
    const url = (output: { path: string }) => "/" + relative(out, output.path).replaceAll("\\", "/");
    const entry = result.outputs.find((output) => output.kind === "entry-point" && output.path.endsWith(".js"))!;
    return { files: result.outputs.map(url), entry: url(entry), meta: result.metafile! };
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
  const { entry: worker } = await bundle("desktop/renderer/worker.ts", { CUBIX_VENDOR: JSON.stringify(`${vendor}/cubing`) });
  // Split: the app and the administration (/admin) are chunks of their own, each page loads only its own code.
  const app = await bundle("desktop/renderer/main.tsx", { CUBIX_WORKER: JSON.stringify(worker), CUBIX_VENDOR: JSON.stringify(`${vendor}/cubing`) }, true);
  // Each language's dictionary, a chunk of its own (src/client/i18n).
  const dictionaries = Object.fromEntries(Object.entries(app.meta.outputs).flatMap(([file, { entryPoint }]) => {
    const language = /i18n\/(\w+)\.json$/.exec(entryPoint ?? "")?.[1];
    return language ? [[language, "/build/" + file.replace(/^\.\//, "")]] : [];
  }));
  // Only the entry runs: it imports its chunks itself. Those the app imports at once download beside it, rather than
  // one after the other as each is read; the engine's bridge and the i18n start with them (main.tsx).
  const start = chunks(app, ["desktop/renderer/app.tsx", "desktop/renderer/bridge.ts", "src/client/i18n/index.ts"]).filter((path) => path !== app.entry);
  const styles = app.files.filter((path) => path.endsWith(".css"));
  // Before anything is drawn: whether this device shows the pages written ahead of time (boot.ts).
  const { entry: boot } = await bundle("desktop/renderer/boot.ts");
  const html = (await readFile("desktop/renderer/index.html", "utf8"))
    .replace("<!-- styles -->", [`<script src="${boot}"></script>`, ...styles.map((href) => `<link rel="stylesheet" href="${href}" />`), ...preloads(fonts), ...start.map((href) => `<link rel="modulepreload" href="${href}" />`)].join("\n    "))
    .replace("<!-- scripts -->", `<script type="module" src="${app.entry}"></script>`);
  await writeFile(join(out, "index.html"), html);
  const pages = await buildPages(out);
  await landing(out, bundle, preloads(fonts), pages);
  await legal(out, bundle);
  if (devTools) {
    // Outside the precache: the page is only served by the development server (desktop/dev.ts).
    const page = await bundle("desktop/renderer/dev/virtualCube.tsx");
    await writeFile(join(out, "dev-cube.html"), (await readFile("desktop/renderer/dev/cube.html", "utf8"))
      .replace("<!-- styles -->", page.files.filter((path) => path.endsWith(".css")).map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n    "))
      .replace("<!-- scripts -->", page.files.filter((path) => path.endsWith(".js")).map((src) => `<script type="module" src="${src}"></script>`).join("\n    ")));
  }
  for (const name of ["manifest.webmanifest", "favicon.svg", "icon-192.png", "icon-512.png"]) await cp(join("desktop/renderer/pwa", name), join(out, name));
  for (const directory of ["icons", "cases"]) await cp(join("desktop/assets", directory), join(out, "assets", directory), { recursive: true });
  // Everything the app needs to open offline, scramblers included: the engine worker starts before the
  // service worker controls a first visit. Case diagrams are kept once shown; dictionaries, the device's one.
  const icons = (await readdir(join(out, "assets/icons"))).map((name) => `/assets/icons/${name}`);
  // The administration is never used offline.
  const shell = app.files.filter((path) => !basename(path).startsWith("admin-") && !Object.values(dictionaries).includes(path));
  // The app's own page, without any page written in it: the one every address opens offline (sw.ts).
  const precache = ["/index.html", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png", worker, boot, ...shell, ...fonts.values(), ...icons, ...vendorFiles];
  // Named after the content, so any changed file installs a new shell cache.
  const hasher = new Bun.CryptoHasher("sha256");
  for (const url of [...precache, ...Object.values(dictionaries)]) hasher.update(url).update(await readFile(join(out, url)));
  const version = hasher.digest("hex").slice(0, 16);
  // The case diagrams keep their names from one build to the next: they are kept until one of them changes.
  const cases = new Bun.CryptoHasher("sha256");
  for (const name of (await readdir(join(out, "assets/cases"))).sort()) cases.update(name).update(await readFile(join(out, "assets/cases", name)));
  const define = { CUBIX_VERSION: JSON.stringify(version), CUBIX_PRECACHE: JSON.stringify(precache), CUBIX_DICTIONARIES: JSON.stringify(dictionaries), CUBIX_CASES: JSON.stringify(cases.digest("hex").slice(0, 16)) };
  const sw = await Bun.build({ entrypoints: ["desktop/renderer/sw.ts"], target: "browser", minify: true, define });
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
async function landing(out: string, bundle: (entry: string, define?: Record<string, string>, splitting?: boolean) => Promise<Bundle>, preloads: string[], pages: string[]) {
  const { createElement } = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { Landing } = await import("./renderer/landing/Landing");
  const { landingDocument, llms, llmsFull, robots, sitemap } = await import("./renderer/landing/document");
  const { DEFAULT_THEME, themeTokens } = await import("../src/client/lib/theme");
  const { LANGUAGES, setLanguage } = await import("../src/client/i18n");
  // Split: the dictionaries load only in their language.
  const { files: outputs, entry } = await bundle("desktop/renderer/landing/main.tsx", {}, true);
  // One page per language, English at the root (landing.html), the others at /fr/, /es/…, served as directories.
  for (const { id } of LANGUAGES) {
    await setLanguage(id, false);
    const file = join(out, id === "en" ? "landing.html" : `${id}/index.html`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, landingDocument({
      language: id,
      body: renderToString(createElement(Landing)),
      theme: themeTokens(DEFAULT_THEME, "dark"),
      styles: outputs.filter((path) => path.endsWith(".css")),
      scripts: [entry],
    }).replace("</head>", `  ${preloads.join("\n    ")}\n  </head>`));
  }
  await setLanguage("en", false);
  await writeFile(join(out, "robots.txt"), robots());
  await writeFile(join(out, "sitemap.xml"), sitemap(new Date().toISOString().slice(0, 10), pages));
  await writeFile(join(out, "llms.txt"), llms());
  await writeFile(join(out, "llms-full.txt"), llmsFull());
  for (const name of ["install.sh", "install.ps1"]) await cp(join("desktop/install", name), join(out, name));
  // Screenshots and the social image, taken by desktop/scripts/landing-shots.ts (the image build has no sharp).
  await cp("desktop/assets/landing", join(out, "assets/landing"), { recursive: true });
  await cp("desktop/assets/landing/og.png", join(out, "og.png"));
}

/** The legal notice, the privacy policy and the terms of use, each written to HTML in French, then hydrated. */
async function legal(out: string, bundle: (entry: string) => Promise<Bundle>) {
  const { createElement } = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { LegalPage } = await import("./renderer/legal/LegalPage");
  const { LEGAL_DOCUMENTS } = await import("./renderer/legal/paths");
  const { DOCUMENTS } = await import("./renderer/legal/documents");
  const { legalDocument } = await import("./renderer/legal/document");
  const { DEFAULT_THEME, themeTokens } = await import("../src/client/lib/theme");
  const { files: outputs, entry } = await bundle("desktop/renderer/legal/main.tsx");
  for (const { id, path } of LEGAL_DOCUMENTS)
    await writeFile(join(out, path.slice(1) + ".html"), legalDocument({
      title: DOCUMENTS[id].fr.title,
      path,
      body: renderToString(createElement(LegalPage, { id })),
      theme: themeTokens(DEFAULT_THEME, "dark"),
      styles: outputs.filter((file) => file.endsWith(".css")),
      scripts: [entry],
    }));
}

/** The fonts, fetched with the stylesheet rather than once it is read: the first screen draws every weight. */
const preloads = (fonts: Map<string, string>) => [...fonts.values()].map((href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin />`);

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
