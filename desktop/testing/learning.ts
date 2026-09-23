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
    console.log("Action", action);
    const alert = await page.locator(".error").textContent({ timeout: 100 }).catch(() => "");
    if (alert) throw Error(alert);
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
  await click("menu:learningGroups");
  await click("moveLearningGroup:2:-1");
  await click("moveLearningGroup:1:-1");
  assert.match(await page.locator(".learning-groups").innerText(), /^1\. Edges Only/);
  assert.equal(await page.getByRole("button", { name: "Move Edges Only up", exact: true }).isDisabled(), true);
  await click("close");
  assert.equal(await page.locator(".case-title").getAttribute("data-action"), first);
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
  await page.setViewportSize({ width: 360, height: 540 });
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  if (await page.locator(".sheet-backdrop").count()) await page.locator('.sheet [data-action="times"]').click();
  await click("menu:learningGroups");
  assert.equal(await page.locator(".learning-groups > .row").count(), 15);
  await page.getByRole("button", { name: "Move I Shape up", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "artifacts/electron/testing/group-order-360x540.png" });
  await click("close");
  await page.setViewportSize({ width: 1280, height: 800 });
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
  await click("menu:learningGroups");
  assert.match(await page.locator(".learning-groups").innerText(), /^1\. Edges Only/);
  await click("close");
  await click(first.replace("case:", "learn:"));
  await page.waitForSelector(".daily-status:text('Algorithm of the day')");
  // Review mixes all learned stages without changing the manual or daily selection.
  const known = ["F2L 2", "OLL 1", first.slice(5)];
  await page.evaluate(async ids => { for (const id of ids) await window.cubix.call("setLearned", id, true); }, known);
  await mode("Review learned");
  await page.waitForSelector(".daily-status:text('3 cases')");
  for (let i = 0; i < 6; i++) {
    const before = (await page.locator(".case-title").getAttribute("data-action"))!.slice(5);
    assert.ok(known.includes(before), "review only shows learned cases");
    await click("next");
    await page.waitForFunction(id => document.querySelector(".case-title")?.getAttribute("data-action") !== `case:${id}`, before);
  }
  if (await page.locator(".rail.right").count()) await page.locator('.rail.right [data-action="times"]').click();
  await page.setViewportSize({ width: 360, height: 540 });
  await page.waitForFunction(() => innerWidth === 360);
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  if (await page.locator(".sheet-backdrop").count()) await page.locator('.sheet [data-action="times"]').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: "artifacts/electron/testing/review-360x540.png" });
  const removed = (await page.locator(".case-title").getAttribute("data-action"))!.slice(5);
  await click(`learn:${removed}`);
  await page.waitForSelector(".daily-status:text('2 cases')");
  assert.notEqual(await page.locator(".case-title").getAttribute("data-action"), `case:${removed}`);
  await page.evaluate(async ids => { for (const id of ids) await window.cubix.call("setLearned", id, false); }, known);
  await page.waitForSelector("h2:text('No learned cases yet')");
  await mode("Free practice");
  await page.waitForSelector('.case-title[data-action="case:F2L 2"]');
  await click("menu:puzzles");
  await page.getByRole("option", { name: "2×2", exact: true }).click();
  await click("menu:learningModes");
  assert.equal(await page.getByRole("option", { name: "Learn PLL", exact: true }).count(), 0);
  assert.equal(await page.getByRole("option", { name: "Review learned", exact: true }).count(), 1);
  assert.deepEqual(errors, []);
  console.log("Daily learning, group ordering and global review: completion, undo, persistence, track isolation, 3×3 restriction and responsive layouts passed.");
} catch (error) { console.error(await pageError(app)); throw error; } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }

async function pageError(app: any) { return (await app.firstWindow()).locator(".error").textContent({ timeout: 200 }).catch(() => "No app error"); }
