/** Headless checks for the error notification. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const result = await Bun.build({
  entrypoints: ["toast-test-harness"], target: "browser",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "harness", setup(build) {
    build.onResolve({ filter: /^toast-test-harness$/ }, () => ({ path: "harness", namespace: "test" }));
    // The engine is a stub: no worker, only failing calls until the test lets them succeed.
    build.onResolve({ filter: /\/bridge$/ }, () => ({ path: "bridge", namespace: "test" }));
    build.onLoad({ filter: /^bridge$/, namespace: "test" }, () => ({ loader: "ts", contents: `
      export const call = (...args) => window.cubixTestCall(...args);
      export const onEvent = () => () => {};
      export const openExternal = async () => {};
    ` }));
    build.onLoad({ filter: /^harness$/, namespace: "test" }, () => ({ loader: "tsx", resolveDir: root, contents: `
      import React, { useSyncExternalStore } from 'react';
      import { createRoot } from 'react-dom/client';
      import { ErrorNotification } from './desktop/renderer/ErrorNotification';
      import { Toasts } from './desktop/renderer/Toasts';
      import { store } from './desktop/renderer/store';
      import { theme } from './desktop/renderer/theme';
      import './desktop/renderer/styles.css';
      let fail = true, retries = 0;
      window.cubixTestCall = async () => { retries++; await new Promise(r => setTimeout(r, 20)); if (fail) throw Error('Case cube and practice context do not match.'); return {}; };
      store.ready = true;
      store.refresh = async () => {};
      window.testToast = {
        error: (message) => store.fail(Error(message)),
        succeed: () => { fail = false; },
        retries: () => retries,
        light: () => { store.light = true; store.emit(); },
      };
      function App() {
        useSyncExternalStore(store.subscribe, () => store.version);
        return <main className="app" style={theme('t3-chat', store.light)}>
          <Toasts light={store.light} />
          <ErrorNotification message={store.error} />
        </main>;
      }
      createRoot(document.getElementById('root')).render(<App />);
    ` }));
  } }],
});
if (!result.success) throw Error(result.logs.join("\n"));
const assets = new Map(result.outputs.map(file => [new URL(file.path, "http://localhost").pathname.split('/').at(-1)!, file]));
const js = result.outputs.find(file => file.kind === "entry-point")!;
const css = result.outputs.find(file => file.path.endsWith(".css"))!;
const server = Bun.serve({ port: 0, fetch(req) {
  const name = new URL(req.url).pathname.slice(1);
  if (!name) return new Response(`<html><head><link rel="stylesheet" href="/${css.path.split('/').at(-1)}"></head><body><div id="root"></div><script type="module" src="/${js.path.split('/').at(-1)}"></script></body></html>`, { headers: { "Content-Type": "text/html" } });
  return assets.has(name) ? new Response(assets.get(name)) : new Response("Missing", { status: 404 });
} });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CUBIX_CHROMIUM ?? "/usr/bin/chromium" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(server.url.href);
  await page.locator('.app').waitFor();
  const message = "Case cube and practice context do not match.";
  await page.evaluate(message => (window as any).testToast.error(message), message);
  const toast = page.locator('.error-toast');
  await toast.waitFor();
  await page.waitForTimeout(400);
  assert.equal(await toast.count(), 1);
  const bounds = await toast.boundingBox();
  assert.ok(bounds && bounds.y < 40 && bounds.x > 800, "Error is at the top right");
  for (let attempt = 1; attempt <= 2; attempt++) {
    await toast.getByRole('button', { name: 'Try again' }).click();
    await page.waitForTimeout(450);
    assert.equal(await page.evaluate(() => (window as any).testToast.retries()), attempt);
    assert.equal(await toast.count(), 1, "Repeated failures stay actionable without duplicates");
    assert.ok((await toast.textContent())?.includes(message));
  }
  await mkdir('artifacts/electron/testing', { recursive: true });
  await page.screenshot({ path: 'artifacts/electron/testing/error-toast-desktop.png' });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => { (window as any).testToast.light(); (window as any).testToast.error('Long error: ' + 'unbroken-message'.repeat(100)); });
  await page.waitForTimeout(400);
  const compact = await toast.boundingBox();
  assert.ok(compact && compact.x >= 0 && compact.x + compact.width <= 320 && compact.y >= 0 && compact.y + compact.height <= 568);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), "No page scrolling");
  await page.screenshot({ path: 'artifacts/electron/testing/error-toast-compact.png' });
  await page.evaluate(() => (window as any).testToast.succeed());
  await toast.getByRole('button', { name: 'Try again' }).click();
  await toast.waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-sonner-toast]').count(), 0, "Recovery clears the notification");
  assert.deepEqual(errors, []);
  console.log('Headless toast checks passed: top placement, repeated failure, recovery, dark/light themes, compact long messages.');
} finally {
  await browser.close();
  server.stop(true);
}
