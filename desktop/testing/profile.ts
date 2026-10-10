/** Profile overview layout: real web UI in headless Chromium, disposable account/storage/API. `--shots` keeps screenshots. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { startServer, signIn } from "./app";

const OUT = "artifacts/profile";
const dir = await mkdtemp(join(tmpdir(), "cubix-profile-"));
const { origin, server } = await startServer(dir);
const browser = await chromium.launch({ executablePath: process.env.CUBIX_TEST_CHROMIUM ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors: string[] = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce", serviceWorkers: "block" });
const page = await context.newPage();
page.on("pageerror", e => errors.push(e.message));
await mkdir(OUT, { recursive: true });

/** Nothing scrolls the page itself, nothing pokes out sideways, and every section sits inside the window. */
async function fits(page: Page, label: string) {
  const report = await page.evaluate(() => {
    const doc = document.documentElement, main = document.querySelector<HTMLElement>('[aria-label="Profile"]');
    const sideways = [...(main?.querySelectorAll<HTMLElement>("*") ?? [])].filter(e => {
      const style = getComputedStyle(e);
      return /(auto|scroll)/.test(style.overflowX) && e.scrollWidth > e.clientWidth + 1 && !e.closest('[aria-label="Activity"]');
    }).map(e => e.className.toString().slice(0, 80));
    return { pageScroll: doc.scrollHeight > innerHeight + 1 || doc.scrollWidth > innerWidth + 1, sideways };
  });
  assert.equal(report.pageScroll, false, `${label}: the page never scrolls`);
  assert.deepEqual(report.sideways, [], `${label}: no sideways scroll inside the profile`);
}

try {
  await page.goto(origin + "/timer");
  // Its own account each run, the Docker stack keeping its database.
  await signIn(page, "profile_ui_" + Date.now().toString(36).slice(-5));
  await page.evaluate(async () => {
    const now = new Date().toISOString();
    await window.cubix.call("updateJourney", {
      profile: { kind: "profile", level: "intermediate", knownPuzzles: ["333", "222"], knownMethods: { "333": ["cfop"] }, priority: "444", learningPuzzles: ["444"], learningMethods: { "444": ["yau"] }, priorityMethod: "yau", completedAt: now },
    });
    for (let i = 0; i < 24; i++) await window.cubix.call("addSolve", { puzzle: "333", solveMode: "standard", scrambleType: "normal", timeMs: 14000 + Math.round(Math.sin(i) * 3000 + i * 90), penalty: i === 7 ? "+2" : "none" });
    for (let i = 0; i < 13; i++) await window.cubix.call("addSolve", { puzzle: "222", solveMode: "standard", scrambleType: "normal", timeMs: 4200 + Math.round(Math.cos(i) * 900), penalty: "none" });
    for (let i = 0; i < 6; i++) await window.cubix.call("addSolve", { puzzle: "333", solveMode: "one-handed", scrambleType: "normal", timeMs: 26000 + i * 700, penalty: i === 2 ? "dnf" : "none" });
  });
  await page.goto(origin + "/profile?puzzle=333");
  await page.locator('[data-tour="profile-overview"]').waitFor();
  for (const [width, height] of [[1280, 800], [1440, 900], [1600, 900], [2048, 1280], [1024, 700], [390, 844], [360, 640]] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    await fits(page, `${width}×${height}`);
    await page.screenshot({ path: `${OUT}/overview-${width}x${height}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  // The notebook: the account's card, the records as plates, the journal of the days with its puzzle, the month.
  for (const label of ["Account", "Personal bests", "Journal", "Calendar"]) assert.equal(await page.locator(`[aria-label="${label}"]`).count(), 1, `the ${label} card`);
  const journal = page.locator('[aria-label="Journal"]');
  assert.ok((await journal.locator("article").count()) >= 1, "the journal has a day");
  assert.match((await journal.locator("article h3").first().textContent()) ?? "", /3×3 best/, "a day names the puzzle's best");
  await journal.locator('[data-action="menu:profilePuzzles"]').click();
  await page.getByRole("menuitemradio", { name: "2×2" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Journal"] article h3')?.textContent?.includes("2×2"));
  await page.screenshot({ path: `${OUT}/overview-222.png` });
  await journal.locator('[data-action="menu:profilePuzzles"]').click();
  await page.getByRole("menuitemradio", { name: "3×3", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Journal"] article h3')?.textContent?.includes("3×3"));
  assert.equal(await page.locator('[aria-label="Personal goals"], [aria-label="Personal setup"]').count(), 0, "no journey or goals on the profile");
  assert.equal(await page.locator('[data-tour="profile-overview"]').count(), 1, "the tour can show the profile");
  // The header: the brand, the five sections, the coffee in plain view, the puzzle and the account's menu with sign-out.
  assert.equal(await page.locator(".rail").getByLabel("Qbix", { exact: true }).count(), 1, "the header carries the Qbix name");
  assert.deepEqual(await page.locator('.rail nav[aria-label="Sections"] a').evaluateAll(nodes => nodes.map(n => n.getAttribute("data-section"))), ["timer", "learn", "algorithms", "compete", "me"]);
  assert.equal(await page.locator('.rail a[href="https://buymeacoffee.com/vitrixxl"]').count(), 1, "the header links to Buy Me a Coffee");
  await page.locator('.rail [data-action="menu:account"]').click();
  await page.locator('[data-slot="dropdown-menu-item"][data-action="logout"]').waitFor({ timeout: 3000 }); // the account menu signs out
  await page.keyboard.press("Escape");
  // The mark follows the puzzle picked in the header, and the tab's icon with it.
  const favicon = () => page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute("href");
  const before = await favicon();
  await page.locator('.rail [data-action="menu:puzzles"]').click();
  await page.getByRole("menuitemradio", { name: "Pyraminx" }).click();
  await page.waitForFunction(() => document.querySelector('.rail [data-action="menu:puzzles"]')?.getAttribute("aria-label") === "Puzzle: Pyraminx");
  assert.notEqual(await favicon(), before, "the tab's icon follows the puzzle");
  await page.goto(origin + "/profile?puzzle=333"); await page.locator('[data-tour="profile-overview"]').waitFor();
  // A fresh account: compact empty states, still inside the window.
  const fresh = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce", serviceWorkers: "block" })).newPage();
  fresh.on("pageerror", e => errors.push(e.message));
  await fresh.goto(origin + "/timer");
  await signIn(fresh, "profile_empty");
  await fresh.goto(origin + "/profile?puzzle=333");
  await fresh.locator('[data-tour="profile-overview"]').waitFor();
  for (const [width, height] of [[1280, 800], [390, 844]] as const) {
    await fresh.setViewportSize({ width, height });
    await fresh.waitForTimeout(250);
    await fits(fresh, `empty ${width}×${height}`);
    await fresh.screenshot({ path: `${OUT}/empty-${width}x${height}.png` });
  }
  assert.deepEqual(errors, []);
  console.log("Profile fits the window at every size, no sideways scroll, tour target, no journey or goals, and separate logout passed.");
} catch (error) {
  await page.screenshot({ path: `${OUT}/failure.png` });
  throw error;
} finally {
  await browser.close();
  server.kill();
  await server.exited;
  await rm(dir, { recursive: true, force: true });
}
