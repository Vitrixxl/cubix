/** The web app as a PWA: opens on the solves stored in IndexedDB, records new ones there, then opens again from the
 * service worker cache, scrambles included, with the server stopped. */
import { launchApp, scrambled, solveCount, startServer, timeSolve } from "./app";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";

const dir = await mkdtemp(join(tmpdir(), "cubix-web-app-"));
const solves = Array.from({ length: 3 }, (_, i) => ({
  id: -(i + 1), session_id: null, case_id: null, puzzle_id: "333", solve_mode: "standard", scramble_type: "normal",
  time_ms: 9000 + i * 100, penalty: "none", scramble: "R U R'", comment: null,
  created_at: new Date(Date.UTC(2026, 8, 1) + i * 3600000).toISOString(),
}));
const storage = {
  "cubix.local.v1:workspace:guest": JSON.stringify({
    version: 1, normalScrambles: true, sessions: {},
    solves: Object.fromEntries(solves.map((s) => [s.id, s])), learned: {}, outbox: [], cursor: 0,
  }),
};
const { origin, server } = await startServer(join(dir, "server"));
// Seeded on the first launch only: the second must find what the first one left.
const open = async (seed?: typeof storage) => {
  const opened = await launchApp({ dir, origin, storage: seed });
  await opened.page.waitForSelector(".timer");
  await scrambled(opened.page);
  return opened;
};
/** The solves stored: the workspace's, and those journaled since it was written whole (src/client/local/client.ts). */
const stored = (page: Page) => page.evaluate(() => new Promise<number>((resolve, reject) => {
  const request = indexedDB.open("cubix");
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const store = request.result.transaction("storage").objectStore("storage"), keys = store.getAllKeys(), values = store.getAll();
    values.onsuccess = () => {
      const all = Object.fromEntries(keys.result.map((key, i) => [String(key), values.result[i]])), key = "cubix.local.v1:workspace:guest";
      const workspace = JSON.parse(all[key]), solves = { ...workspace.solves };
      for (let n = 0; all[`${key}/${n}`]; n++) {
        const entry = JSON.parse(all[`${key}/${n}`]);
        if (entry.base !== workspace.base) break;
        Object.assign(solves, entry.solves);
      }
      resolve(Object.values(solves).filter((s: any) => s && !s.deleted).length);
    };
  };
}));
const scramble = (page: Page, puzzle: string) =>
  page.evaluate((puzzle) => window.cubix.call("scramble", { puzzle, solveMode: "standard", scrambleType: "normal" }), puzzle);
try {
  let { app, page, errors } = await open(storage);
  assert.equal(await stored(page), 3);
  for (const puzzle of ["222", "333", "444", "555", "666", "777", "pyram", "skewb", "sq1", "minx"]) {
    const text = await scramble(page, puzzle);
    assert.ok(typeof text === "string" && text.length > 0, `${puzzle} scramble`);
  }
  console.log("Every puzzle scrambles in the browser engine");
  await timeSolve(page);
  await solveCount(page, 1); // The metrics count this launch's session only.
  assert.equal(await stored(page), 4);
  await page.evaluate(() => navigator.serviceWorker.ready);
  console.log("Solve recorded; service worker active");
  assert.deepEqual(errors, []);
  await app.close();

  server.kill();
  await server.exited;
  ({ app, page, errors } = await open());
  assert.equal(await stored(page), 4);
  for (const puzzle of ["444", "sq1", "minx"]) assert.ok(await scramble(page, puzzle));
  console.log("Opened offline from the service worker cache, with a scramble and the 4 solves");
  assert.deepEqual(errors, []);
  await app.close();
} finally {
  server.kill();
  await rm(dir, { recursive: true, force: true });
}
