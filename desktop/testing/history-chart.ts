/** Chart gestures against deterministic guest history in the real Electron app. */
import { launchApp, startServer } from "./app";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "cubix-chart-"));
const solves = Array.from({ length: 608 }, (_, i) => ({
  id: -(i + 1), session_id: null, case_id: null,
  puzzle_id: i < 600 ? "333" : i === 600 ? "222" : "444",
  solve_mode: "standard", scramble_type: "normal",
  time_ms: i === 570 ? 83000 : 15000 + Math.round(Math.sin(i * 1.7) * 3500),
  penalty: i > 600 || i % 37 === 0 ? "dnf" : i % 43 === 0 ? "+2" : "none",
  scramble: "R U R'", comment: null,
  created_at: new Date(Date.UTC(2026, 8, 1) + i * 3600000).toISOString(),
}));
await Bun.write(join(dir, "storage.json"), JSON.stringify({
  "cubix.local.v1:workspace:guest": JSON.stringify({
    version: 1, normalScrambles: true, sessions: {},
    solves: Object.fromEntries(solves.map(s => [s.id, s])), learned: {}, outbox: [], cursor: 0,
  }),
  "cubix.playground.scrambleByContext": JSON.stringify({ "333:standard:normal": "R U R'" }),
}));
const { origin, server } = await startServer(join(dir, "server"));
const app = await launchApp({ dir, origin, ozone: "headless" });
try {
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  const act = async (action: string) => {
    await page.locator(`[data-action="${action}"]`).first().click();
    await page.waitForSelector("[data-exiting]", { state: "detached" });
  };
  await act("nav:profile");
  await act("profileMode:playground");
  const rows = page.locator(".history-row"), plot = page.locator(".chart-plot");
  // Chart and table share one panel; its header states how many solves the period holds.
  const view = async (name: "Chart" | "Table") => {
    await page.getByRole("button", { name, exact: true }).click();
    await page.locator(name === "Chart" ? ".chart-plot" : ".solves-head").waitFor();
  };
  const shownCount = () => page.evaluate(() => Number(document.querySelector(".solves-count")?.textContent?.split(" ")[0] ?? 0));
  await page.waitForFunction(() => document.querySelector(".solves-count")?.textContent === "600 solves");
  assert.equal(await rows.count(), 0);
  await view("Table");
  assert.equal(await rows.count(), 100); // The table draws its rows in pages.
  await view("Chart");
  const summary = await page.locator(".stat-strip").innerText();
  const bounds = async () => {
    const box = (await plot.boundingBox())!;
    return { x: box.x, y: box.y + box.height / 2, width: box.width };
  };
  const drag = async (from: number, to: number, shift = false) => {
    const b = await bounds();
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.move(b.x + b.width * from, b.y);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * to, b.y, { steps: 12 });
    await page.mouse.up();
    if (shift) await page.keyboard.up("Shift");
  };
  const selectedCount = async (expected?: number) => {
    await page.waitForFunction(n => {
      const count = Number(document.querySelector(".solves-count")?.textContent?.split(" ")[0] ?? 0);
      return n == null ? count > 1 && count < 600 : count === n;
    }, expected);
    return shownCount();
  };
  await drag(0.25, 0.65);
  const selected = await selectedCount();
  assert(selected > 230 && selected < 250, `Selected ${selected}`);
  assert.equal(await page.locator(".solves-count").innerText(), `${selected} of 600 solves`);
  assert.equal(await page.locator(".stat-strip").innerText(), summary);
  await view("Table"); // The selection carries over to the table and back.
  assert.equal(await shownCount(), selected);
  const beforePan = await rows.first().innerText();
  await view("Chart");
  await drag(0.6, 0.3, true);
  assert.equal(await shownCount(), selected);
  await view("Table");
  assert.notEqual(await rows.first().innerText(), beforePan);
  await view("Chart");
  const b = await bounds();
  await page.mouse.move(b.x + b.width / 2, b.y);
  await page.mouse.wheel(0, -220);
  await page.waitForFunction(n => Number(document.querySelector(".solves-count")?.textContent?.split(" ")[0]) < n, selected);
  const zoomCount = await shownCount();
  assert(zoomCount > 1);
  await plot.focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(await shownCount(), zoomCount);
  await page.keyboard.press("Home");
  await selectedCount(600);
  await drag(0.7, 0.3); // Reverse selections work too.
  await selectedCount();
  await page.mouse.dblclick(b.x + b.width / 2, b.y);
  await selectedCount(600);
  await drag(0.2, 0.7);
  await selectedCount();
  await page.getByRole("button", { name: "Reset zoom" }).click();
  await selectedCount(600);
  await plot.focus();
  await page.keyboard.press("+");
  await selectedCount();
  await page.keyboard.press("Home");
  await selectedCount(600);
  await page.mouse.move(b.x + b.width * 0.2, b.y);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5, b.y);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await selectedCount(600);
  console.log("Chart: selection, reverse selection, zoom, pan, reset, keyboard and cancellation passed");

  await view("Table");
  const times = () => page.locator(".history-row > span:nth-child(2)").allInnerTexts();
  const seconds = (v: string) => (v === "DNF" ? Infinity : Number(v));
  await page.getByRole("button", { name: "Sort solves" }).click();
  await page.getByRole("option", { name: "Fastest first" }).click();
  const fastest = (await times()).slice(0, 20).map(seconds);
  assert.deepEqual(fastest, [...fastest].sort((a, b) => a - b));
  await page.getByRole("button", { name: "Sort solves" }).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("button", { name: "Sort solves" }).innerText(), "Slowest first");
  assert.equal((await times())[0], "1:23.000"); // DNFs stay last in both directions, as on mobile.
  await page.getByRole("button", { name: "Sort solves" }).click();
  await page.getByRole("option", { name: "Newest first" }).click();
  await page.getByRole("button", { name: "Show more (500 left)" }).click();
  assert.equal(await rows.count(), 200);

  const first = page.locator(".solve-row").first(),
    newest = await first.locator(".history-row").innerText();
  await first.getByRole("button", { name: "+2 penalty" }).click();
  await page.waitForFunction(() => document.querySelector(".solve-row .history-tags")?.textContent?.includes("+2"));
  await first.getByRole("button", { name: "Add comment" }).click();
  await page.locator(".modal textarea").fill("Missed the last AUF");
  await page.getByRole("button", { name: "Save" }).click();
  await page.locator(".solve-comment", { hasText: "Missed the last AUF" }).waitFor();
  await page.getByRole("button", { name: "Show only commented solves" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".history-row").length === 1);
  await page.locator(".solve-row").first().getByRole("button", { name: "Delete solve" }).click();
  await page.getByText("No commented solve yet").waitFor();
  await page.getByRole("button", { name: "Show only commented solves" }).click();
  await selectedCount(599);
  assert.notEqual(await page.locator(".history-row").first().innerText(), newest);
  console.log("Table: sort menu (mouse and keyboard), paging, +2, comment, commented filter and delete passed");

  await mkdir("artifacts/electron/testing", { recursive: true });
  for (const [width, height] of [[1920, 1080], [1280, 800], [800, 600], [640, 480], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    for (const name of ["Table", "Chart"] as const) {
      await view(name);
      await page.waitForTimeout(100);
      const layout = await page.evaluate(() => {
        const panel = document.querySelector(".stats-grid > .panel")!.getBoundingClientRect();
        const nav = document.querySelector(".nav")!.getBoundingClientRect();
        const plot = document.querySelector(".chart-plot")?.getBoundingClientRect();
        const bar = document.querySelector(".stats-grid > .panel > .row")!;
        const profile = document.querySelector(".profile-main")!;
        return {
          visible: panel.bottom <= nav.top && panel.right <= innerWidth && (!plot || plot.height >= 40),
          barFits: bar.scrollWidth <= bar.clientWidth + 1,
          fits: document.documentElement.scrollHeight === innerHeight && document.documentElement.scrollWidth === innerWidth,
          internalFits: profile.scrollHeight <= profile.clientHeight + 1,
        };
      });
      await page.screenshot({ path: `artifacts/electron/testing/history-${name.toLowerCase()}-${width}.png` });
      assert.deepEqual(layout, { visible: true, barFits: true, fits: true, internalFits: true }, `${name} ${width}×${height}`);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [label, count] of [["2×2", 1], ["4×4", 7], ["5×5", 0]] as const) {
    await act("menu:profilePuzzles");
    await page.getByRole("option", { name: label, exact: true }).click();
    await selectedCount(count);
    if (count) {
      assert.equal(await page.locator(".chart-reset").count(), 0);
      assert(!(await plot.innerHTML()).match(/NaN|Infinity/));
      await plot.focus();
      await page.keyboard.press("+");
      await page.keyboard.press("Home");
      await selectedCount(count);
      const p = await bounds();
      await page.mouse.move(p.x + p.width / 2, p.y);
      await page.locator(".chart-tip").waitFor();
      if (count === 7) assert((await page.locator(".chart-tip").innerText()).includes("DNF"));
    }
  }
  assert.deepEqual(errors, []);
  console.log("Chart: 390–1920px layouts, single solve, all-DNF history, empty history and context reset passed");
} finally {
  await app.close();
  server.kill();
  await rm(dir, { recursive: true, force: true });
}
