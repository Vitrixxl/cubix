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
  // No records table nor latest solves: the timer card picks its event in its title, its best single among its figures.
  assert.equal(await page.locator('[aria-label="Personal records"], [aria-label="Latest solves"]').count(), 0, "no records nor latest solves on the overview");
  const timer = page.locator('[aria-label="Timer"]');
  assert.equal(await timer.getByText("Best single", { exact: true }).count(), 1, "the best single beside the current figures");
  await timer.locator('[data-action="menu:profilePuzzles"]').click();
  await page.getByRole("listbox", { name: "Puzzle" }).getByRole("option", { name: "2×2" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Timer"] h2')?.textContent?.includes("2×2"));
  await page.screenshot({ path: `${OUT}/overview-222.png` });
  await timer.locator('[data-action="menu:profilePuzzles"]').click();
  await page.getByRole("listbox", { name: "Puzzle" }).getByRole("option", { name: "3×3", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Timer"] h2')?.textContent?.includes("3×3"));
  assert.equal(await page.locator('[aria-label="Personal goals"], [aria-label="Personal setup"]').count(), 0, "no journey or goals on the profile");
  assert.equal(await page.locator('[data-tour="profile-overview"]').count(), 1, "the tour can show the profile");
  assert.equal(await page.locator('.rail [data-action="logout"]').count(), 1, "the sidebar has its own logout row");
  const profileRow = await page.locator('.rail [data-action="nav:profile"]').boundingBox(), logout = await page.locator('.rail [data-action="logout"]').boundingBox();
  assert.ok(profileRow && logout && logout.x >= profileRow.x + profileRow.width && Math.abs(logout.y + logout.height / 2 - (profileRow.y + profileRow.height / 2)) <= 2, "logout is its own icon button, right of the profile");
  // The sidebar folds to its icons and stays folded after a reload; it unfolds the same way.
  const state = () => page.locator('[data-slot="sidebar"]').first().getAttribute("data-state");
  assert.equal(await state(), "expanded");
  await page.locator('[data-action="sidebar:toggle"]').click();
  await page.waitForFunction(() => document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state") === "collapsed");
  await page.reload(); await page.locator(".rail").waitFor();
  assert.equal(await state(), "collapsed", "the folded sidebar is remembered");
  // Folded, every icon of the sidebar sits on the same vertical axis.
  const centres = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.rail [data-brand] svg, .rail [data-slot="sidebar-menu-button"], .rail [aria-label^="Puzzle"], .rail [data-action="logout"]')]
    .filter(e => e.getClientRects().length).map(e => { const r = e.getBoundingClientRect(); return r.left + r.width / 2; }));
  assert.ok(centres.length >= 10 && Math.max(...centres) - Math.min(...centres) < 0.5, `folded sidebar icons are aligned (${centres.join(", ")})`);
  // Folded, a section's name shows almost at once on hover.
  await page.locator('.rail [data-action="nav:training"]').hover();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-slot="tooltip-content"]').filter({ hasText: "Training" }).count(), 1, "folded tooltips are quick");
  await page.locator(".rail [data-brand]").hover();
  await page.locator('[data-action="sidebar:toggle"]').click();
  await page.waitForFunction(() => document.querySelector('[data-slot="sidebar"]')?.getAttribute("data-state") === "expanded");
  assert.equal(await page.locator(".rail").getByLabel("Qbix", { exact: true }).count(), 1, "the sidebar carries the Qbix name");
  // The mark is the puzzle picker: picking a puzzle redraws it, and the tab's icon with it.
  const favicon = () => page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute("href");
  const before = await favicon();
  await page.locator('.rail [data-brand] [data-action="menu:puzzles"]').click();
  await page.getByRole("option", { name: "Pyraminx" }).click();
  await page.waitForFunction(() => document.querySelector('.rail [data-brand] [aria-label^="Puzzle"]')?.getAttribute("aria-label") === "Puzzle: Pyraminx");
  assert.notEqual(await favicon(), before, "the tab's icon follows the puzzle");
  assert.equal(await page.locator('.rail a[href="https://buymeacoffee.com/vitrixxl"]').count(), 1, "the sidebar links to Buy Me a Coffee");
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
