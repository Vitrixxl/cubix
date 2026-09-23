/** Daily learning integration: real Electron, isolated offline workspace. */
import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
delete process.env.ELECTRON_RUN_AS_NODE;
const dir = await mkdtemp(join(tmpdir(), "cubix-learning-"));
const launch = () => electron.launch({ executablePath: process.env.CUBIX_TEST_ELECTRON ?? resolve("node_modules/electron/dist/electron"), args: ["--ozone-platform=x11", resolve("desktop/dist"), `--user-data-dir=${join(dir, "chromium")}`], env: { ...process.env, CUBIX_BUN: process.execPath, CUBIX_DESKTOP_DATA: dir, CUBIX_API_ORIGIN: "http://127.0.0.1:47139" } });
let app = await launch();
try {
  let page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  const click = async (action: string) => {
    await page.locator(`[data-action="${action}"]`).first().click();
    await page.waitForSelector("[data-exiting]", { state: "detached" });
  };
  const mode = async (label: string) => {
    await click("menu:learningModes");
    await page.getByRole("option", { name: label, exact: true }).click();
  };
  await page.waitForSelector(".timer");
  await click("nav:algorithms"); await click("case:F2L 2"); await click("train");
  await page.waitForSelector('.case-title[data-action="case:F2L 2"]');
  await mode("Learn PLL");
  await page.waitForSelector(".daily-status:text('Algorithm of the day')");
  const first = await page.locator(".case-title").getAttribute("data-action");
  assert.ok(first);
  await click("solution");
  await mkdir("artifacts/electron/testing", { recursive: true });
  for (const [width, height] of [[360, 540], [390, 844], [640, 480], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const issues = await page.evaluate(() => {
      const problems = [];
      if (document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth) problems.push("page scrolls");
      const box = (q: string) => document.querySelector(q)!.getBoundingClientRect();
      if (box(".practice-above").bottom > box(".timer").top + 1) problems.push("case overlaps timer");
      if (box(".practice-below").bottom > box(".practice-toolbar").top + 1) problems.push("stats overlap toolbar");
      if (box(".practice-toolbar").bottom > box(".nav").top + 1) problems.push("toolbar overlaps nav");
      return problems;
    });
    assert.deepEqual(issues, [], `${width}×${height}`);
    await page.screenshot({ path: `artifacts/electron/testing/learning-${width}x${height}.png` });
  }
  await page.keyboard.down("Space");
  await page.waitForSelector('.timer[data-phase="Ready"]');
  await page.keyboard.up("Space");
  await page.waitForSelector('.timer[data-phase="Running"]');
  await page.keyboard.press("a");
  await page.waitForSelector('[data-action^="penalty:"]');
  assert.equal(await page.locator(".case-title").getAttribute("data-action"), first, "timed attempts stay on the daily case");
  await click(first.replace("case:", "learn:"));
  await page.waitForSelector(".daily-status:text('next tomorrow')");
  assert.equal(await page.locator(".case-title").getAttribute("data-action"), first);
  await mode("Learn OLL");
  await page.waitForSelector(".daily-status:text('Algorithm of the day')");
  const oll = await page.locator(".case-title").getAttribute("data-action");
  assert.notEqual(oll, first);
  await mode("Learn PLL");
  await page.waitForSelector(".daily-status:text('next tomorrow')");
  assert.equal(await page.locator(".case-title").getAttribute("data-action"), first);
  await mode("Free practice");
  await page.waitForSelector('.case-title[data-action="case:F2L 2"]');
  await mode("Learn PLL");
  await app.close();
  app = await launch(); page = await app.firstWindow();
  await page.waitForSelector(".timer"); await click("nav:training");
  await page.waitForSelector(".daily-status:text('next tomorrow')");
  assert.equal(await page.locator(".case-title").getAttribute("data-action"), first, "daily assignment survives restart");
  await click(first.replace("case:", "learn:"));
  await page.waitForSelector(".daily-status:text('Algorithm of the day')");
  await click("menu:puzzles");
  await page.getByRole("option", { name: "2×2", exact: true }).click();
  await page.waitForSelector('[data-action="menu:learningModes"]', { state: "detached" });
  assert.deepEqual(errors, []);
  console.log("Daily learning: repetition, completion, undo, track switch, free selection, restart, 3×3 restriction and 4 viewport sizes passed.");
} finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
