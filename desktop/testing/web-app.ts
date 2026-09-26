/** The desktop app as a PWA: imports the former engine's storage.json once, records solves in IndexedDB,
 * then opens again from the service worker cache, scrambles included, with the server stopped. */
import { launchApp, startServer } from "./app";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "cubix-web-app-"));
const solves = Array.from({ length: 3 }, (_, i) => ({
  id: -(i + 1), session_id: null, case_id: null, puzzle_id: "333", solve_mode: "standard", scramble_type: "normal",
  time_ms: 9000 + i * 100, penalty: "none", scramble: "R U R'", comment: null,
  created_at: new Date(Date.UTC(2026, 8, 1) + i * 3600000).toISOString(),
}));
await Bun.write(join(dir, "storage.json"), JSON.stringify({
  "cubix.local.v1:workspace:guest": JSON.stringify({
    version: 1, normalScrambles: true, sessions: {},
    solves: Object.fromEntries(solves.map((s) => [s.id, s])), learned: {}, outbox: [], cursor: 0,
  }),
}));
let { origin, server } = await startServer(join(dir, "server"));
const open = async () => {
  const app = await launchApp({ dir, origin });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForSelector(".timer");
  await page.waitForFunction(() => {
    const text = document.querySelector(".scramble")?.textContent;
    return !!text && !text.includes("Generating");
  }, undefined, { timeout: 60000 });
  return { app, page, errors };
};
const stored = (page: Awaited<ReturnType<typeof open>>["page"]) => page.evaluate(() => new Promise<number>((resolve, reject) => {
  const request = indexedDB.open("cubix");
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const get = request.result.transaction("storage").objectStore("storage").get("cubix.local.v1:workspace:guest");
    get.onsuccess = () => resolve(Object.values(JSON.parse(get.result).solves).filter((s: any) => !s.deleted).length);
  };
}));
const count = (page: Awaited<ReturnType<typeof open>>["page"], n: number) =>
  page.waitForFunction((n) => document.querySelector(".practice-metrics .value")?.textContent === String(n), n);
try {
  let { app, page, errors } = await open();
  assert.equal(await stored(page), 3);
  assert.ok(!existsSync(join(dir, "storage.json")) && existsSync(join(dir, "storage.imported.json")), "storage.json is set aside once imported");
  console.log("Former desktop data imported into IndexedDB");
  for (const puzzle of ["222", "333", "444", "555", "666", "777", "pyram", "skewb", "sq1", "minx", "clock"]) {
    const scramble = await page.evaluate((puzzle) => window.cubix.call("scramble", { puzzle, solveMode: "standard", scrambleType: "normal" }), puzzle);
    assert.ok(typeof scramble === "string" && scramble.length > 0, `${puzzle} scramble`);
  }
  console.log("Every puzzle scrambles in the browser engine");
  await page.keyboard.down("Space");
  await page.waitForSelector('[data-phase="Ready"]');
  await page.keyboard.up("Space");
  await page.waitForSelector('[data-phase="Running"]');
  await page.waitForTimeout(160);
  await page.keyboard.press("a");
  // The metrics count this launch's session only.
  await count(page, 1);
  await page.waitForFunction(() => document.querySelector('[data-phase="Idle"]'));
  assert.equal(await stored(page), 4);
  await page.evaluate(() => navigator.serviceWorker.ready);
  console.log("Solve recorded; service worker active");
  assert.deepEqual(errors, []);
  await app.close();

  server.kill();
  await server.exited;
  ({ app, page, errors } = await open());
  assert.equal(await stored(page), 4);
  for (const puzzle of ["444", "sq1", "clock"])
    assert.ok(await page.evaluate((puzzle) => window.cubix.call("scramble", { puzzle, solveMode: "standard", scrambleType: "normal" }), puzzle));
  console.log("Opened offline from the service worker cache, with a scramble and the 4 solves");
  assert.deepEqual(errors, []);
  await app.close();
} finally {
  server.kill();
  await rm(dir, { recursive: true, force: true });
}
