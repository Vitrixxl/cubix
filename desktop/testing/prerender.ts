/** The app's public pages written ahead of time and the app without an account, in a headless Chromium against a
 * disposable API serving the web build: what a crawler reads without JavaScript, the page giving way to the app, the
 * language of the address, an account's page sending a guest to the login page and back, and an account's device never
 * showing a guest's page. Build first: `bun run build:api && bun desktop/web.ts`. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./app";

const SHOTS = "artifacts/prerender";
await mkdir(SHOTS, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), "cubix-prerender-"));
const { origin, server } = await startServer(join(dir, "server"));
const browser = await chromium.launch({ executablePath: process.env.CUBIX_TEST_CHROMIUM ?? "/usr/bin/chromium", headless: true });
const viewport = { width: 1440, height: 900 };
const errors: string[] = [];
const live = (page: import("playwright").Page) => page.waitForFunction(() => !document.getElementById("prerendered") && !!document.getElementById("root")?.childElementCount, undefined, { timeout: 30000 });
try {
  // A crawler without JavaScript reads the whole page: its title, description, address in each language, content.
  const crawler = await (await browser.newContext({ javaScriptEnabled: false, viewport })).newPage();
  const response = await crawler.goto(origin + "/algorithms/OLL%2021");
  assert.equal(response?.status(), 200);
  assert.equal(await crawler.title(), "OLL 21 (H Shape) algorithm | Qbix");
  assert.match((await crawler.locator('meta[name="description"]').getAttribute("content"))!, /R U R' U R U' R' U R U2 R'/);
  assert.equal(await crawler.locator('meta[name="robots"]').getAttribute("content"), "index, follow, max-image-preview:large");
  assert.equal(await crawler.locator('link[rel="alternate"][hreflang]').count(), 6);
  // Each move is an element of its own.
  assert.ok((await crawler.locator("#prerendered").innerText()).replace(/\s+/g, " ").includes("Algorithms 1 R U R' U R U' R' U R U2 R'"));
  assert.ok((await crawler.locator('#prerendered a[href="/algorithms/OLL%2022?puzzle=333"]').count()) > 0, "the other cases are links");
  await crawler.screenshot({ path: `${SHOTS}/crawler.png` });
  const shell = await crawler.goto(origin + "/community");
  assert.equal(await crawler.locator('meta[name="robots"]').getAttribute("content"), "noindex", "an account's page is not for search engines");
  assert.equal(shell?.status(), 200);
  console.log("Crawlers read each public page whole without JavaScript; an account's page is not indexed");

  // A guest: the page gives way to the app, which works on this device without an account.
  const guest = await (await browser.newContext({ viewport })).newPage();
  guest.on("pageerror", (e) => errors.push(e.message));
  await guest.goto(origin + "/algorithms/OLL%2021");
  await live(guest);
  assert.equal(await guest.title(), "OLL 21 (H Shape) algorithm | Qbix");
  await guest.locator('a[data-action="case:OLL 22"]').click();
  await guest.waitForURL(/OLL%2022/);
  await guest.waitForFunction(() => document.title.startsWith("OLL 22"));
  console.log("The page gives way to the app; a case's link opens it in place, the title following");

  // An account's page sends the guest to the login page, and back there once signed in.
  await guest.locator('[data-action="nav:community"]').first().click();
  await guest.waitForSelector(".login");
  assert.equal(new URL(guest.url()).pathname + new URL(guest.url()).search, "/login?redirect=%2Fcommunity");
  await guest.screenshot({ path: `${SHOTS}/login.png` });
  await guest.locator('[data-action="login:guest"]').click();
  await guest.waitForURL(/OLL%2022/);
  await guest.locator('[data-action="nav:login"]').first().click();
  await guest.waitForSelector(".login");
  await guest.locator('[data-action="login:mode:register"]').click();
  await guest.fill("#login-username", `prerender_${Date.now() % 1e8}`);
  await guest.fill("#login-password", "a-long-test-password");
  await guest.locator('[data-action="login:submit"]').click();
  await guest.waitForURL((url) => url.pathname !== "/login", { timeout: 30000 });
  console.log("An account's page asks a guest to sign in, and the login page goes back where it was asked from");

  // An account's device never shows a guest's page written ahead of time.
  await guest.goto(origin + "/algorithms?puzzle=333");
  assert.ok(await guest.evaluate(() => document.documentElement.hasAttribute("data-account")));
  assert.ok(await guest.evaluate(() => { const page = document.getElementById("prerendered"); return !page || getComputedStyle(page).display === "none"; }));
  console.log("An account's device skips the guest's page");

  // The language of the address; a German browser on an English address moves under /de.
  const fr = await (await browser.newContext({ viewport })).newPage();
  await fr.goto(origin + "/fr/learn/cfop?puzzle=333&step=2");
  assert.equal(await fr.evaluate(() => document.documentElement.lang), "fr");
  assert.match(await fr.title(), /^Méthode CFOP pour le 3x3, étape 3/);
  await live(fr);
  assert.match(await fr.title(), /^Méthode CFOP/);
  await fr.screenshot({ path: `${SHOTS}/fr.png` });
  const de = await (await browser.newContext({ viewport, locale: "de-DE" })).newPage();
  await de.goto(origin + "/timer");
  await live(de);
  assert.equal(new URL(de.url()).pathname, "/de/timer");
  console.log("Each language under its prefix; a browser in another language moves under its own");

  // The sitemap lists the pages in every language.
  const sitemap = await (await fetch(origin + "/sitemap.xml")).text();
  assert.ok(sitemap.includes("/fr/algorithms/OLL%2021</loc>") && sitemap.includes('hreflang="it"'));
  assert.deepEqual(errors, []);
  console.log("Prerendered pages and the app without an account passed");
} finally {
  await browser.close();
  server.kill();
  await rm(dir, { recursive: true, force: true });
}
