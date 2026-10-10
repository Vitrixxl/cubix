/** Chart gestures against a deterministic history (a guest's, taken over by the account) in the real Electron app. */
import { SHOTS, act as click, launchApp, signIn, startServer } from "./app";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
const { app, page, errors } = await launchApp({ dir, origin });
try {
  const act = (action: string) => click(page, action);
  // The app is used signed in: the new account takes the guest history over.
  await signIn(page, "chart");
  await act("nav:profile");
  await act("profileMode:playground");
  // One row per solve in the table: the row's button opens the solve, its actions stand beside it.
  const rows = page.locator('[data-row]'), plot = page.getByRole("group", { name: /^Solve times/ });
  const row = (i: number) => rows.nth(i).locator("..");
  // The chart and the solves of its period side by side; the period states how many solves it holds.
  const countText = () => (document.querySelector("[data-count]") as HTMLElement | null)?.dataset.count ?? "0";
  const shownCount = () => page.evaluate(countText).then(Number);
  await page.waitForFunction(() => (document.querySelector("[data-count]") as HTMLElement | null)?.dataset.count === "600", undefined, { timeout: 60000 });
  assert.equal(await rows.count(), 100); // The table draws its rows in pages.
  const figures = () => page.locator('[aria-label="Figures"] tbody tr').filter({ hasText: "Solves" }).innerText();
  assert.match(await figures(), /600\s+600/);
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
      const count = Number((document.querySelector("[data-count]") as HTMLElement | null)?.dataset.count ?? "0");
      return n == null ? count > 1 && count < 600 : count === n;
    }, expected);
    return shownCount();
  };
  await drag(0.25, 0.65);
  const selected = await selectedCount();
  assert(selected > 230 && selected < 250, `Selected ${selected}`);
  // The figures follow the period: its solves beside every one.
  assert.match(await figures(), new RegExp(`${selected}\\s+600`));
  const beforePan = await rows.first().innerText();
  await drag(0.6, 0.3, true);
  assert.equal(await shownCount(), selected);
  assert.notEqual(await rows.first().innerText(), beforePan);
  const b = await bounds();
  await page.mouse.move(b.x + b.width / 2, b.y);
  await page.mouse.wheel(0, -220);
  await page.waitForFunction(n => Number((document.querySelector("[data-count]") as HTMLElement | null)?.dataset.count) < n, selected);
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

  // The time of each row, without its PB or +2 tag.
  const times = () => page.locator('[data-action^="solve:"] > span:nth-child(2) > span:first-child').allInnerTexts();
  const seconds = (v: string) => (v === "DNF" ? Infinity : Number(v));
  const sort = page.getByRole("button", { name: "Sort solves" });
  await sort.click();
  await page.getByRole("menuitemradio", { name: "Fastest first" }).click();
  const fastest = (await times()).slice(0, 20).map(seconds);
  assert.deepEqual(fastest, [...fastest].sort((a, b) => a - b));
  // The keyboard: arrows move through the sorts, Enter picks one.
  await sort.click();
  const highlighted = page.locator("[role=menuitemradio][data-highlighted]");
  await page.getByRole("menu").waitFor();
  for (let i = 0; i < 4 && !(await highlighted.filter({ hasText: "Slowest first" }).count()); i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(await sort.innerText(), "Slowest first");
  assert.equal((await times())[0], "1:23.000"); // DNFs stay last in both directions, as on mobile.
  await sort.click();
  await page.getByRole("menuitemradio", { name: "Newest first" }).click();
  await page.getByRole("button", { name: "Show more (500 left)" }).click();
  assert.equal(await rows.count(), 200);

  const newest = await rows.first().innerText();
  await row(0).locator('[data-action$=":+2"]').click();
  await page.waitForFunction(() => document.querySelector('[data-action^="solve:"]')?.textContent?.includes("+2"));
  await row(0).getByRole("button", { name: "Add comment" }).click();
  // The solve's dialog opens on its comment, focused; Enter saves it.
  await page.locator("[role=dialog] textarea:focus").fill("Missed the last AUF");
  await page.keyboard.press("Enter");
  await page.locator("[role=dialog]").getByText("Missed the last AUF").waitFor();
  await page.keyboard.press("Escape");
  await rows.filter({ hasText: "Missed the last AUF" }).waitFor();
  await page.getByRole("button", { name: "Show only commented solves" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-row]").length === 1);
  await row(0).getByRole("button", { name: "Delete solve" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await page.getByText("No commented solve yet").waitFor();
  await page.getByRole("button", { name: "Show only commented solves" }).click();
  await selectedCount(599);
  assert.notEqual(await rows.first().innerText(), newest);
  console.log("Table: sort menu (mouse and keyboard), paging, +2, comment, commented filter and delete passed");

  await mkdir(SHOTS, { recursive: true });
  for (const [width, height] of [[1920, 1080], [1280, 800], [800, 600], [640, 480], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => {
      // The cards shown (the curve and the list, or one tab of them on a short window) end inside the window.
      const cards = [...document.querySelectorAll('[data-slot="app-main"] section[aria-label="Timer"] [data-slot="card"]')].map((c) => c.getBoundingClientRect());
      const list = { bottom: Math.max(...cards.map((c) => c.bottom)), right: Math.max(...cards.map((c) => c.right)), height: Math.min(...cards.map((c) => c.height)) };
      const tabbar = document.querySelector('.tabbar')?.getBoundingClientRect();
      const plot = document.querySelector('[role="group"][aria-label^="Solve times"]')?.getBoundingClientRect();
      const profile = document.querySelector('[data-slot="app-main"] section[aria-label="Timer"]')!;
      return {
        visible: list.bottom <= (tabbar?.top ?? innerHeight) + 1 && list.right <= innerWidth && list.height >= 80 && (!plot || plot.height >= 40),
        fits: document.documentElement.scrollHeight === innerHeight && document.documentElement.scrollWidth === innerWidth,
        internalFits: profile.scrollHeight <= profile.clientHeight + 1,
      };
    });
    await page.screenshot({ path: `${SHOTS}/history-${width}.png` });
    assert.deepEqual(layout, { visible: true, fits: true, internalFits: true }, `${width}×${height}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const [label, count] of [["2×2", 1], ["4×4", 7], ["5×5", 0]] as const) {
    await act("menu:profilePuzzles");
    await page.getByRole("menuitemradio", { name: label, exact: true }).click();
    await selectedCount(count);
    if (count) {
      assert.equal(await page.getByRole("button", { name: "Reset zoom" }).count(), 0);
      assert(!(await plot.innerHTML()).match(/NaN|Infinity/));
      await plot.focus();
      await page.keyboard.press("+");
      await page.keyboard.press("Home");
      await selectedCount(count);
      const p = await bounds();
      await page.mouse.move(p.x + p.width / 2, p.y);
      // The hovered solve's card: its time, its Ao5 and its date.
      const tip = plot.locator("strong");
      await tip.waitFor();
      if (count === 7) assert((await tip.innerText()).includes("DNF"));
    }
  }
  assert.deepEqual(errors, []);
  console.log("Chart: 390–1920px layouts, single solve, all-DNF history, empty history and context reset passed");
} finally {
  await app.close();
  server.kill();
  await rm(dir, { recursive: true, force: true });
}
