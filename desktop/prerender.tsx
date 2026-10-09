/**
 * The app's public pages written to HTML ahead of time, in every language (desktop/renderer/seo.ts): search engines and
 * link previews read each page whole without running it, and a visitor sees it at once. The app then starts beside it
 * and takes its place once it draws the page itself (`reveal`, desktop/renderer/app.tsx): nothing is hydrated, so the
 * app's first drawing owes nothing to this one.
 *
 * The app is drawn here as a guest on a wide window, its data engine absent (renderer/bridge.ts is replaced): every page
 * shows the catalogue, the courses and the timer, none of anyone's data. `buildPages` splits the pages between several
 * processes, each running this file on its share.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

/** What the app reads of a browser while it is drawn, before any of its modules is loaded. */
function browser() {
  const storage = () => {
    const values = new Map<string, string>();
    return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => void values.set(k, String(v)), removeItem: (k: string) => void values.delete(k), clear: () => values.clear(), key: () => null, length: 0 };
  };
  const media = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  Object.assign(globalThis, {
    window: globalThis,
    innerWidth: 1440,
    innerHeight: 900,
    localStorage: storage(),
    sessionStorage: storage(),
    matchMedia: media,
    addEventListener() {},
    removeEventListener() {},
    location: new URL("https://localhost/timer"),
    history: { state: null, replaceState() {}, pushState() {} },
    CUBIX_DEV: false,
  });
  Bun.plugin({
    name: "prerender",
    setup(build) {
      // No data engine: nothing it would answer is drawn.
      build.onLoad({ filter: /renderer[\\/]bridge\.ts$/ }, () => ({
        loader: "ts",
        contents: "export const call = (..._: unknown[]) => new Promise<any>(() => {}); export const onEvent = () => () => {}; export const openExternal = () => {}; export const socket = { send: () => false, on: () => () => {}, connected: () => false };",
      }));
      build.onLoad({ filter: /\.css$/ }, () => ({ loader: "js", contents: "" }));
    },
  });
}

/** Brotli's quality for the pages: nearly the smallest files, several times faster than the most. */
const QUALITY = 7;

/** Writes this process's share of the pages (`index` of `count`) under `out`, each in every language, into `template`. */
async function renderShare(out: string, template: string, index: number, count: number) {
  browser();
  const { createElement } = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { prerender } = await import("react-dom/static");
  const { StaticRouter } = await import("react-router");
  const { Root } = await import("./renderer/app");
  const { store: s } = await import("./renderer/store");
  const { readRoute, localePath } = await import("../src/client/lib/route");
  const { pageDocument } = await import("./renderer/pageDocument");
  const { prerenderedPages, seoOf } = await import("./renderer/seo");
  const { LANGUAGES, setLanguage } = await import("../src/client/i18n");
  const { DEFAULT_THEME, themeTokens } = await import("../src/client/lib/theme");
  const theme = themeTokens(DEFAULT_THEME, "dark");
  const initial = { ...s };
  const pages = prerenderedPages().filter((_, i) => i % count === index);
  for (const { id: language } of LANGUAGES) {
    await setLanguage(language, false);
    for (const { url, files } of pages) {
      const { pathname, search } = new URL(url, "https://localhost");
      const route = readRoute(pathname, search)!;
      Object.assign(s, initial, { prefs: {}, ready: true, introductionReady: true, user: { id: "local-guest", username: "Guest", isGuest: true } });
      s.loadContext();
      s.applyRoute(route);
      const app = createElement(StaticRouter, { location: localePath(language, url), basename: language === "en" ? undefined : "/" + language }, createElement(Root));
      let body = renderToString(app);
      // A part of the app not loaded yet draws its fallback: wait for every part once, then draw the page again.
      if (body.includes("<!--$!-->")) {
        await new Response((await prerender(app)).prelude).text();
        body = renderToString(app);
        if (body.includes("<!--$!-->")) throw new Error(`${url}: a part of the page did not load`);
      }
      const seo = seoOf(pathname, search)!;
      // Only compressed: thousands of pages would take a gigabyte as they are (web.rs serves the one the browser takes).
      const html = pageDocument(template, { language, seo, body, theme, localePath });
      const br = brotliCompressSync(html, { params: { [constants.BROTLI_PARAM_QUALITY]: QUALITY, [constants.BROTLI_PARAM_SIZE_HINT]: html.length } }), gz = gzipSync(html, { level: 6 });
      for (const file of files) {
        const path = join(out, "pages", language, file);
        await mkdir(dirname(path), { recursive: true });
        await Promise.all([writeFile(path + ".br", br), writeFile(path + ".gz", gz)]);
      }
    }
  }
}

/**
 * Builds every page under `out`/pages from the app's `index.html`, split between processes: as many as the machine has
 * cores, or `CUBIX_PRERENDER_JOBS`. Returns the pages' addresses, for the sitemap.
 */
export async function buildPages(out: string) {
  const jobs = Math.max(1, Number(process.env.CUBIX_PRERENDER_JOBS) || availableParallelism());
  const children = Array.from({ length: jobs }, (_, index) =>
    Bun.spawn([process.execPath, import.meta.path, out, String(index), String(jobs)], { stdout: "inherit", stderr: "inherit", env: { ...process.env, NODE_ENV: "production" } }),
  );
  const codes = await Promise.all(children.map((child) => child.exited));
  if (codes.some((code) => code !== 0)) throw new Error("Prerendering the pages failed");
  const { prerenderedPages } = await import("./renderer/seo");
  return prerenderedPages().map((page) => page.url);
}

if (import.meta.main) {
  const [out, index, count] = process.argv.slice(2);
  await renderShare(out!, await Bun.file(join(out!, "index.html")).text(), Number(index), Number(count));
  process.exit(0);
}
