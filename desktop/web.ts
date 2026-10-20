/** Builds the web app into dist/web, which the API serves.
 *
 *   /                      landing.html: the landing page, rendered here (desktop/renderer/landing)
 *   /timer, /learn…        index.html, the app (never cached by HTTP, network-first in the service worker); its public
 *                          pages written ahead of time in every language under pages/ (desktop/prerender.tsx)
 *   /robots.txt…           with sitemap.xml, llms.txt and llms-full.txt, for search engines and language models
 *   /build/*               bundles, fonts and the scrambler (scrambler/) with a content hash in their name, immutable
 *   /assets/*              icons, case diagrams and the mouse pointers (scripts/build-cursors.ts)
 */
import { cp, mkdir, rename, rm, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, gzip as gzipCompress, constants } from "node:zlib";
import type { BuildOutput, BunPlugin } from "bun";
import { compile, Features } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { buildPages } from "./prerender";

const root = resolve(import.meta.dir, "..");
process.chdir(root);
export const WEB_DIR = resolve(root, "dist/web");
/** The mouse pointers (scripts/build-cursors.ts), linked as they are by every page: a bundler would resolve their
 * absolute URLs and cannot read image-set() in an @supports. */
const CURSORS = "/assets/cursors/cursors.css";

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

/** What a case holds that nothing reads at start-up: a megabyte and a half of the catalogue. */
const DETAILS = ["algorithms", "setups_alt", "notes"];
/**
 * The catalogue split in two for the app and its engine: the cases without their `DETAILS` (still with an empty list of
 * algorithms) where they start (store.ts, seo.ts, src/client/local/catalog.ts), the `DETAILS` alone in
 * src/client/local/catalogDetails.ts, a chunk of its own fetched by what reads them. Other importers get it whole.
 */
const catalogSplit: BunPlugin = {
  name: "catalog",
  setup(build) {
    build.onResolve({ filter: /[\\/]catalog\.json$/ }, ({ path, importer }) => {
      const part = /[\\/]catalogDetails\.ts$/.test(importer) ? "details" : /[\\/](store|seo)\.ts$|[\\/]local[\\/]catalog\.ts$/.test(importer) ? "index" : null;
      // A path of each part's own: Bun takes two modules of one path for the same, whatever their namespace.
      return part ? { path: `${resolve(dirname(importer), path)}?${part}`, namespace: `catalog-${part}` } : undefined;
    });
    type Catalog = { cases: Record<string, unknown>[] };
    const split = (namespace: string, part: (catalog: Catalog) => unknown) =>
      build.onLoad({ filter: /./, namespace }, async ({ path }) => ({ contents: `export default ${JSON.stringify(part(await Bun.file(path.replace(/\?\w+$/, "")).json()))}`, loader: "js" }));
    const keep = (c: Record<string, unknown>, details: boolean) => Object.fromEntries(Object.entries(c).filter(([key]) => DETAILS.includes(key) === details || (details && key === "id")));
    split("catalog-index", (catalog) => ({ ...catalog, cases: catalog.cases.map((c) => ({ ...keep(c, false), algorithms: [] })) }));
    split("catalog-details", (catalog) => ({ cases: catalog.cases.map((c) => keep(c, true)) }));
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
  // The phone app (mobile/, React Native for the web), exported under /phone beside the rest of the build.
  const phone = exportPhone(join(out, "phone")).catch((error: Error) => error);
  const production = { "process.env.NODE_ENV": '"production"', CUBIX_DEV: String(devTools) };
  const naming = { entry: "[name]-[hash].[ext]", chunk: "[name]-[hash].[ext]", asset: "[name]-[hash].[ext]" };
  // The fonts (desktop/scripts/subset-fonts.ts), named after their content: the stylesheet links them rather than
  // inlining them, so they download in parallel and only the weights a page draws. The PDF's static weights too.
  const fonts = new Map<string, string>();
  for (const name of await readdir("desktop/assets/fonts")) {
    const ext = name.endsWith(".woff2") ? ".woff2" : /-\d00\.ttf$/.test(name) ? ".ttf" : "";
    if (!ext) continue;
    const bytes = await readFile(join("desktop/assets/fonts", name));
    const url = `/build/${basename(name, ext)}-${new Bun.CryptoHasher("sha256").update(bytes).digest("hex").slice(0, 8)}${ext}`;
    await writeFile(join(out, url), bytes);
    fonts.set(name, url);
  }
  const linked: BunPlugin = {
    name: "fonts",
    setup(build) {
      // A stylesheet links the font; a script gets its address.
      build.onResolve({ filter: /\.(woff2|ttf)$/ }, ({ path, importer }) => {
        const url = fonts.get(basename(path));
        if (!url) throw new Error(`Unknown font ${path}: run desktop/scripts/subset-fonts.ts`);
        return importer.endsWith(".css") ? { path: url, external: true } : { path: url, namespace: "font-url" };
      });
      build.onLoad({ filter: /.*/, namespace: "font-url" }, ({ path }) => ({ contents: `export default ${JSON.stringify(path)}`, loader: "js" }));
    },
  };
  const bundle = async (entrypoint: string, define: Record<string, string> = {}, splitting = false): Promise<Bundle> => {
    const result = await Bun.build({ entrypoints: [entrypoint], outdir: join(out, "build"), target: "browser", minify: true, splitting, naming, plugins: [tailwind, linked, catalogSplit], metafile: true, define: { ...production, ...define } });
    if (!result.success) throw new AggregateError(result.logs, `Build failed: ${entrypoint}`);
    const url = (output: { path: string }) => "/" + relative(out, output.path).replaceAll("\\", "/");
    const entry = result.outputs.find((output) => output.kind === "entry-point" && output.path.endsWith(".js"))!;
    return { files: result.outputs.map(url), entry: url(entry), meta: result.metafile! };
  };
  // The scrambler (scrambler/, WebAssembly), which the engine worker runs.
  const wasm = await readFile("scrambler/scrambler.wasm");
  const scrambler = `/build/scrambler-${new Bun.CryptoHasher("sha256").update(wasm).digest("hex").slice(0, 8)}.wasm`;
  await writeFile(join(out, scrambler), wasm);
  // Split: the catalogue's details (catalogSplit) are a chunk of their own.
  const { entry: worker, files: engine } = await bundle("desktop/renderer/worker.ts", { CUBIX_SCRAMBLER: JSON.stringify(scrambler) }, true);
  // Split: the app and the administration (/admin) are chunks of their own, each page loads only its own code.
  const app = await bundle("desktop/renderer/main.tsx", { CUBIX_WORKER: JSON.stringify(worker) }, true);
  // Each language's dictionary, a chunk of its own (src/client/i18n).
  const dictionaries = Object.fromEntries(Object.entries(app.meta.outputs).flatMap(([file, { entryPoint }]) => {
    const language = /i18n\/(\w+)\.json$/.exec(entryPoint ?? "")?.[1];
    return language ? [[language, "/build/" + file.replace(/^\.\//, "")]] : [];
  }));
  // Only the entry runs: it imports its chunks itself. Those the app imports at once download beside it, rather than
  // one after the other as each is read; the engine's bridge and the i18n start with them (main.tsx).
  const start = chunks(app, ["desktop/renderer/app.tsx", "desktop/renderer/bridge.ts", "src/client/i18n/index.ts"]).filter((path) => path !== app.entry);
  const styles = app.files.filter((path) => path.endsWith(".css"));
  // The app and the landing page draw in Bricolage alone (globals.css): Geist is only the first launch's (firstLaunch.ts).
  const face = preloads(new Map([...fonts].filter(([name]) => name.startsWith("Bricolage"))));
  // Before anything is drawn: whether this device shows the pages written ahead of time, and which app it loads, the
  // desktop one or the phone one (boot.ts writes either's tags).
  const desktopHead = [...[...styles, CURSORS].map((href) => `<link rel="stylesheet" href="${href}" />`), ...face, ...start.map((href) => `<link rel="modulepreload" href="${href}" />`), `<script type="module" src="${app.entry}"></script>`];
  let phoneHead = await phone;
  if (phoneHead instanceof Error) {
    // In development the desktop app is still served, everywhere, while mobile/ does not build.
    if (!devTools) throw phoneHead;
    console.warn(`${phoneHead.message}\nServing the desktop app at every width.`);
    phoneHead = "";
  }
  // The screen of a device's first launch (firstLaunch.ts), which boot.ts loads, its text in each dictionary's language.
  const { FIRST_LAUNCH_TEXT } = await import("../src/client/lib/firstLaunch");
  const firstLaunchText: Record<string, string> = {};
  for (const name of await readdir("src/client/i18n")) {
    if (name.endsWith(".json") && name !== "keys.json") firstLaunchText[basename(name, ".json")] = JSON.parse(await readFile(join("src/client/i18n", name), "utf8"))[FIRST_LAUNCH_TEXT];
  }
  const { entry: firstLaunch } = await bundle("desktop/renderer/firstLaunch.ts", { CUBIX_FIRST_LAUNCH_TEXT: JSON.stringify(firstLaunchText) });
  const { entry: boot } = await bundle("desktop/renderer/boot.ts", { CUBIX_DESKTOP_HEAD: JSON.stringify(desktopHead.join("\n")), CUBIX_PHONE_HEAD: JSON.stringify(phoneHead), CUBIX_FIRST_LAUNCH: JSON.stringify(firstLaunch) });
  const html = (await readFile("desktop/renderer/index.html", "utf8"))
    .replace("<!-- styles -->", `<script src="${boot}"></script>`)
    .replace("<!-- scripts -->", "");
  await writeFile(join(out, "index.html"), html);
  // The administration's page (go-api/web.go serves it at /admin): the same, which boot.ts gives the desktop app
  // without the app's chunks loaded ahead.
  await writeFile(join(out, "admin.html"), html);
  const pages = await buildPages(out);
  await landing(out, bundle, face, pages, [app.entry, ...start, ...styles]);
  await legal(out, bundle);
  if (devTools) {
    // Outside the precache: the page is only served by the development server (desktop/dev.ts).
    const page = await bundle("desktop/renderer/dev/virtualCube.tsx");
    await writeFile(join(out, "dev-cube.html"), (await readFile("desktop/renderer/dev/cube.html", "utf8"))
      .replace("<!-- styles -->", page.files.filter((path) => path.endsWith(".css")).map((href) => `<link rel="stylesheet" href="${href}" />`).join("\n    "))
      .replace("<!-- scripts -->", page.files.filter((path) => path.endsWith(".js")).map((src) => `<script type="module" src="${src}"></script>`).join("\n    ")));
  }
  for (const name of ["manifest.webmanifest", "favicon.svg", "icon-192.png", "icon-512.png"]) await cp(join("desktop/renderer/pwa", name), join(out, name));
  for (const directory of ["icons", "cases", "cursors"]) await cp(join("desktop/assets", directory), join(out, "assets", directory), { recursive: true });
  // Everything the app needs to open offline, scramblers included: the engine worker starts before the
  // service worker controls a first visit. Case diagrams are kept once shown; dictionaries, the device's one.
  const icons = (await readdir(join(out, "assets/icons"))).map((name) => `/assets/icons/${name}`);
  const cursors = (await readdir(join(out, "assets/cursors"))).filter((name) => /\.(png|css)$/.test(name)).map((name) => `/assets/cursors/${name}`);
  // The administration is never used offline, nor a coach's private notes (their editor, coaching/notes.tsx).
  const shell = app.files.filter((path) => !/^(admin|notes)-/.test(basename(path)) && !Object.values(dictionaries).includes(path));
  // The app's own page, without any page written in it: the one every address opens offline (sw.ts). Either app's
  // files: the desktop one's bundles, or the phone one's, those its page loads and its workers (mobile/public).
  const precache = {
    shared: ["/index.html", "/manifest.webmanifest", "/favicon.svg", "/icon-192.png", "/icon-512.png", boot, firstLaunch, ...cursors],
    // Once each: the catalogue's details are both the engine's and the app's, and addAll refuses a request twice.
    desktop: [...new Set([...engine, ...shell, ...fonts.values(), ...icons, scrambler])],
    // Its pages loaded on first use (mobile/App.tsx `lazyPage`) too, in the chunks beside the one it starts with.
    phone: phoneHead ? [...new Set([...[...phoneHead.matchAll(/(?:href|src)="(\/phone\/[^"]+)"/g)].map((match) => match[1]!), ...(await readdir(join(out, "phone/_expo/static/js/web"))).filter((name) => name.endsWith(".js")).map((name) => `/phone/_expo/static/js/web/${name}`)]), "/phone/scrambler.js", "/phone/scan.js"] : [],
  };
  // Named after the content, so any changed file installs a new shell cache.
  const hasher = new Bun.CryptoHasher("sha256");
  for (const url of [...precache.shared, ...precache.desktop, ...precache.phone, ...Object.values(dictionaries)]) hasher.update(url).update(await readFile(join(out, url)));
  const version = hasher.digest("hex").slice(0, 16);
  // The case diagrams keep their names from one build to the next: they are kept until one of them changes.
  const cases = new Bun.CryptoHasher("sha256");
  for (const name of (await readdir(join(out, "assets/cases"))).sort()) cases.update(name).update(await readFile(join(out, "assets/cases", name)));
  const define = { CUBIX_VERSION: JSON.stringify(version), CUBIX_PRECACHE: JSON.stringify(precache), CUBIX_DICTIONARIES: JSON.stringify(dictionaries), CUBIX_CASES: JSON.stringify(cases.digest("hex").slice(0, 16)), CUBIX_PHONE: JSON.stringify(new Bun.CryptoHasher("sha256").update(phoneHead).digest("hex").slice(0, 16)) };
  const sw = await Bun.build({ entrypoints: ["desktop/renderer/sw.ts"], target: "browser", minify: true, define });
  if (!sw.success) throw new AggregateError(sw.logs, "Build failed: service worker");
  await writeFile(join(out, "sw.js"), await sw.outputs[0].text());
  await compress(out);
  return { version };
}

/**
 * The landing page at the root, rendered to HTML here so it reads whole without JavaScript, then hydrated; the files
 * search engines and language models look for beside it; its screenshots and its social image.
 */
async function landing(out: string, bundle: (entry: string, define?: Record<string, string>, splitting?: boolean) => Promise<Bundle>, preloads: string[], pages: string[], app: string[]) {
  const { createElement } = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { Landing } = await import("./renderer/landing/Landing");
  const { landingDocument, llms, llmsFull, robots, sitemap } = await import("./renderer/landing/document");
  const { DEFAULT_THEME, themeTokens } = await import("../src/client/lib/theme");
  const { LANGUAGES, setLanguage } = await import("../src/client/i18n");
  // Split: the dictionaries load only in their language.
  const { files: outputs, entry, meta } = await bundle("desktop/renderer/landing/main.tsx", {}, true);
  // The texts its code can show: the strings written in it, the dictionaries aside.
  const ts = await import("typescript");
  const written = new Set<string>();
  const visit = (node: import("typescript").Node): void => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) written.add(node.text);
    ts.forEachChild(node, visit);
  };
  for (const [file, { entryPoint }] of Object.entries(meta.outputs))
    if (file.endsWith(".js") && !/i18n\/\w+\.json$/.test(entryPoint ?? "")) visit(ts.createSourceFile(file, await readFile(join(out, "build", file), "utf8"), ts.ScriptTarget.Latest));
  const html = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  // One page per language, English at the root (landing.html), the others at /fr/, /es/…, served as directories.
  for (const { id } of LANGUAGES) {
    await setLanguage(id, false);
    const file = join(out, id === "en" ? "landing.html" : `${id}/index.html`);
    const body = renderToString(createElement(Landing));
    // Its texts in its language, in the page (landing/main.tsx): it is drawn by React at once, not once the whole
    // dictionary, the app's, is fetched. Those its code writes, and any shown in the page.
    const words = id === "en" ? [] : Object.entries<string>(JSON.parse(await readFile(`src/client/i18n/${id}.json`, "utf8")))
      .filter(([key, value]) => written.has(key) || body.includes(html(value)));
    const dictionary = words.length ? `<script type="application/json" id="dictionary">${JSON.stringify(Object.fromEntries(words)).replace(/</g, "\\u003c")}</script>` : "";
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, landingDocument({
      language: id,
      body,
      theme: themeTokens(DEFAULT_THEME, "dark"),
      styles: [...outputs.filter((path) => path.endsWith(".css")), CURSORS],
      scripts: [entry],
      app,
    }).replace("</head>", `  ${[...preloads, dictionary].join("\n    ")}\n  </head>`));
  }
  await setLanguage("en", false);
  await writeFile(join(out, "robots.txt"), robots());
  await writeFile(join(out, "sitemap.xml"), sitemap(pages));
  await writeFile(join(out, "llms.txt"), llms());
  await writeFile(join(out, "llms-full.txt"), llmsFull());
  // Screenshots and the social image, taken by desktop/scripts/landing-shots.ts (the image build has no sharp); the
  // social image at the root only, where the pages name it.
  await cp("desktop/assets/landing", join(out, "assets/landing"), { recursive: true });
  await rename(join(out, "assets/landing/og.png"), join(out, "og.png"));
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
      styles: [...outputs.filter((file) => file.endsWith(".css")), CURSORS],
      scripts: [entry],
    }));
}

/**
 * The phone app (mobile/: the Android app's React Native code, through react-native-web) exported to `out`, served at
 * /phone; returns the tags its page needs, which boot.ts writes in the app's page on a phone. Its own index.html is
 * dropped: it lives at the app's addresses, like the desktop one.
 */
async function exportPhone(out: string): Promise<string> {
  const exported = Bun.spawn(["bunx", "expo", "export", "--platform", "web", "--output-dir", out], {
    // Metro keeps every module imported otherwise: the whole of lucide-react-native's icons, 2 MB, for the few in use.
    cwd: "mobile", env: { ...process.env, CUBIX_WEB_BASE: "/phone", EXPO_UNSTABLE_TREE_SHAKING: "1", EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH: "1" }, stdout: "ignore", stderr: "pipe",
  });
  if (await exported.exited) throw new Error(`Phone app export failed:\n${await new Response(exported.stderr).text()}`);
  const page = await readFile(join(out, "index.html"), "utf8");
  await rm(join(out, "index.html"));
  await rm(join(out, "metadata.json"), { force: true });
  // React Native for the web's reset (the page's height, no scrolling of the body), its stylesheet and its bundle.
  const tags: string[] = page.match(/<style id="expo-reset">[\s\S]*?<\/style>|<link rel="stylesheet"[^>]*>|<script src="[^"]*"[^>]*><\/script>/g) ?? [];
  if (!tags.some((tag) => tag.startsWith("<script"))) throw new Error("The phone app's index.html has no script");
  // The app's own chunk, which index loads only once it runs: fetched with the others instead.
  const scripts = join(out, "_expo/static/js/web");
  const app = (await readdir(scripts)).find((file) => /^App-\w+\.js$/.test(file));
  if (app) tags.unshift(`<link rel="preload" href="/phone/_expo/static/js/web/${app}" as="script" />`);
  // A page written ahead of time is never shown under the phone app, at any width (pageDocument.ts hides it, and shows the
  // app it covers, only up to a phone's width): the app is in view at once, over pageDocument.ts's more specific rule.
  // Like a native app, no text is selected by a long press or a drag, `selectable` texts included; only fields keep it.
  // A drawing keeps its size: in a crowded row the browser would narrow an icon (flex items shrink on the web, never
  // in React Native), squashing it. The mouse pointers (CURSORS) replace those its Tailwind classes (outside any layer)
  // and React Native for the web give: its pressables (Pressable, Touchable…, a Text with onPress) share one class, the
  // hash of cursor: pointer, its Switch that of cursor: default, in a stylesheet it writes after this one.
  return [...tags, `<link rel="stylesheet" href="${CURSORS}" />`, "<style>#prerendered{display:none}#prerendered~#root{position:static!important;visibility:visible!important;pointer-events:auto!important}" +
    "#root *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none}#root :focus,#root :focus-visible{outline:none!important;--tw-ring-shadow:0 0 #0000!important;--tw-ring-offset-shadow:0 0 #0000!important}#root :is(input,textarea,[contenteditable]){-webkit-user-select:text!important;user-select:text!important}#root svg{flex-shrink:0}" +
    ":root .r-1loqt21{cursor:var(--cursor-pointer)}:root .r-7q8q6z{cursor:var(--cursor-default)}.cursor-default{cursor:var(--cursor-default)}</style>"].join("\n");
}

/** Fonts fetched with the stylesheet rather than once it is read. */
const preloads = (fonts: Map<string, string>) => [...fonts.values()].map((href) => `<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin />`);

const brotli = promisify(brotliCompress), gzip = promisify(gzipCompress);

/** Precompressed copies the API serves when the browser accepts them; the Pi never compresses on the fly. All at once,
 * on every core: one after the other, the case diagrams' thousands took seconds. */
async function compress(directory: string): Promise<void> {
  const files = (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(js|css|html|svg|json|webmanifest|ttf|xml|txt|wasm)$/.test(entry.name));
  await Promise.all(files.map(async (entry) => {
    const path = join(entry.parentPath, entry.name);
    const bytes = await readFile(path);
    if (bytes.length < 1024) return;
    const [br, gz] = await Promise.all([brotli(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }), gzip(bytes, { level: 9 })]);
    await Promise.all([writeFile(path + ".br", br), writeFile(path + ".gz", gz)]);
  }));
}

if (import.meta.main) {
  // `--dev <directory>`: the development server's build (desktop/dev.ts); `<directory>`: a production build elsewhere
  // than dist/web (scripts/deploy.ts).
  const dev = process.argv[2] === "--dev", out = dev ? resolve(process.argv[3]!) : process.argv[2] ? resolve(process.argv[2]) : WEB_DIR;
  const { version } = await buildWeb(out, { devTools: dev });
  console.log(`Web app ${version} built in ${relative(root, out)}`);
}
