/** Onboarding, goals and the app tour on the real web UI: headless Chromium, disposable account/storage/API. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { startServer, signIn } from "./app";
import { TOUR_STEPS } from "../../src/client/lib/journey";

const SHOTS = "artifacts/onboarding";
const dir = await mkdtemp(join(tmpdir(), "cubix-introduction-"));
const { origin, server } = await startServer(dir);
const browser = await chromium.launch({ executablePath: process.env.CUBIX_TEST_CHROMIUM ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] }).catch(async error => { server.kill(); await server.exited; await rm(dir, { recursive: true, force: true }); throw error; });
const errors: string[] = [];
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce", serviceWorkers: "block" });
const page = await context.newPage();
page.on("pageerror", e => errors.push(e.message));
await mkdir(SHOTS, { recursive: true });
const shot = (name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const heading = (text: string) => page.getByRole("heading", { name: text, exact: true }).waitFor();
const next = () => page.getByRole("button", { name: "Continue", exact: true }).click();
const checkbox = (name: string) => page.getByRole("checkbox", { name, exact: true });
const checked = async (name: string) => (await checkbox(name).getAttribute("aria-checked")) === "true";
const noPageScroll = async (what: string) =>
  assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth || scrollY !== 0), false, `${what}: the page never scrolls`);
const bounded = async (selector: string) => {
  const box = await page.locator(selector).boundingBox(), view = page.viewportSize()!;
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= view.width + 1 && box.y + box.height <= view.height + 1, `${selector} fits the ${view.width}×${view.height} window`);
  await noPageScroll(selector);
};
/** The onboarding fits each size: no page scroll, its footer and every footer button inside the window. */
const fits = async (sizes: [number, number][], name?: string) => {
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await bounded(".journey-setup"); await bounded(".journey-footer");
    for (const button of await page.locator(".journey-footer button:visible").all()) {
      const b = await button.boundingBox();
      assert.ok(b && b.x >= 0 && b.x + b.width <= width + 1, "footer buttons fit the window");
    }
    if (name) { await page.waitForTimeout(350); await shot(`${name}-${width}x${height}`); }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
};
const SIZES: [number, number][] = [[1280, 800], [1600, 900], [2048, 1280], [360, 640], [320, 568]];

/** Every tour step: the page opens, its tab and its inner part are cut out, the card stays inside and beside them. */
async function tour(name: string, { desktop }: { desktop: boolean }) {
  for (const [i, st] of TOUR_STEPS.entries()) {
    await heading(st.title);
    // Settled: every visible inner element lies inside a cut-out (no inner element: the tab alone).
    await page.waitForFunction(inner => {
      const els = [...document.querySelectorAll(`[data-tour="${inner}"]`)].filter(e => e.getClientRects().length && e.closest("[data-app-shell]") && !e.closest("[data-exiting]"));
      const holes = [...document.querySelectorAll('[data-spotlight="inner"]')].map(h => h.getBoundingClientRect());
      if (!document.querySelector('[data-spotlight="nav"]')) return false;
      if (!els.length) return holes.length === 0;
      return els.every(e => {
        // Cut-outs keep 4px from the window edges.
        const r = e.getBoundingClientRect(), top = Math.max(4, r.top), bottom = Math.min(innerHeight - 4, r.bottom), left = Math.max(4, r.left), right = Math.min(innerWidth - 4, r.right);
        return holes.some(h => h.left <= left + 1 && h.top <= top + 1 && h.right >= right - 1 && h.bottom >= bottom - 1);
      });
    }, st.inner, { timeout: 10000 });
    const pathname = new URL(page.url()).pathname;
    assert.ok(pathname.startsWith(st.page === "playground" ? "/timer" : "/" + st.page), `step ${i + 1} opens ${st.page} (at ${pathname})`);
    await bounded(".journey-tour-card");
    assert.equal(await page.locator("[data-app-shell]").evaluate((n: HTMLElement) => n.inert), true, "the app is inert during the tour");
    const inner = await page.locator('[data-spotlight="inner"]').count();
    if (desktop && inner) {
      // Beside the highlighted part: the card covers at most a sliver of it.
      const covered = await page.evaluate(() => {
        const card = document.querySelector(".journey-tour-card")!.getBoundingClientRect();
        return Math.max(...[...document.querySelectorAll('[data-spotlight="inner"]')].map(h => {
          const r = h.getBoundingClientRect(), w = Math.max(0, Math.min(r.right, card.right) - Math.max(r.left, card.left)), hh = Math.max(0, Math.min(r.bottom, card.bottom) - Math.max(r.top, card.top));
          return (w * hh) / (r.width * r.height);
        }));
      });
      assert.ok(covered < 0.12, `step ${i + 1} (${st.inner}): the card covers ${Math.round(covered * 100)}% of the highlighted part`);
    }
    await page.waitForTimeout(300); await shot(`tour-${name}-${i + 1}-${st.inner}`);
    await page.getByRole("button", { name: i === TOUR_STEPS.length - 1 ? "Done" : "Next", exact: true }).click();
  }
  await page.locator(".journey-tour").waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-app-shell]").evaluate((n: HTMLElement) => n.inert), false);
}

/** Picks `option` in the shadcn select named `label`. */
async function choose(p: Page, label: string, option: string) {
  await p.getByRole("combobox", { name: label, exact: true }).click();
  await p.getByRole("option", { name: option, exact: true }).click();
}

try {
  await page.goto(origin); await signIn(page, "introduction_ui", "a-long-test-password", true);
  await heading("Welcome to Cubix");
  assert.equal(new URL(page.url()).pathname, "/onboarding");
  for (const name of ["Later", "Close", "Cancel"]) assert.equal(await page.getByRole("button", { name, exact: true }).count(), 0, `no ${name} on a first onboarding`);
  await page.keyboard.press("Escape"); await heading("Welcome to Cubix");
  await page.goto(origin + "/duel"); await heading("Welcome to Cubix");
  assert.equal(new URL(page.url()).pathname, "/onboarding");
  await fits(SIZES, "welcome");
  // Enter continues from the page.
  await page.keyboard.press("Enter"); await heading("Your level");
  await page.getByRole("radio", { name: /^Beginner/ }).click();
  await page.keyboard.press("ArrowDown"); assert.equal(await page.getByRole("radio", { name: /^Intermediate/ }).getAttribute("aria-checked"), "true");
  await page.keyboard.press("ArrowUp"); assert.equal(await page.getByRole("radio", { name: /^Beginner/ }).getAttribute("aria-checked"), "true");
  await fits(SIZES, "level");
  await page.getByRole("radio", { name: /^Beginner/ }).focus();
  await page.keyboard.press("Enter"); await heading("Puzzles you can solve");

  assert.equal(await checked("None yet"), true);
  await checkbox("3×3").click();
  assert.equal(await checked("None yet"), false);
  await checkbox("3×3 CFOP").click(); await checkbox("3×3 Roux").click();
  assert.equal(await checked("3×3 CFOP"), true);
  await fits(SIZES, "known");
  await next();

  await heading("What do you want to learn?");
  await checkbox("2×2").click();
  await checkbox("2×2 Ortega").click(); await checkbox("2×2 Ortega").click();
  assert.equal(await checked("2×2 Ortega"), false);
  await checkbox("2×2 Ortega").click();
  await checkbox("4×4").click(); await checkbox("4×4 Reduction").click(); await checkbox("4×4 Yau").click();
  // Removing a puzzle removes its methods; picking it again starts empty.
  await checkbox("4×4").click(); assert.equal(await checkbox("4×4 Yau").count(), 0);
  await checkbox("4×4").click(); assert.equal(await checked("4×4 Yau"), false);
  await checkbox("4×4 Reduction").click(); await checkbox("4×4 Yau").click();
  assert.equal(await checked("2×2"), true);
  await fits(SIZES, "learning");
  await next();

  await heading("Your goals");
  const suggested = page.locator('[aria-label="Suggested goals"] button');
  assert.ok(await suggested.count() >= 2, "goals are suggested from the answers");
  await suggested.first().click();
  assert.equal(await suggested.first().getAttribute("aria-pressed"), "true");
  await suggested.nth(1).click(); await suggested.nth(1).click();
  assert.equal(await suggested.nth(1).getAttribute("aria-pressed"), "false", "a suggestion toggles off");
  const drafts = page.locator('[aria-label="Added goals"] li');
  assert.equal(await drafts.count(), 1);
  await page.getByRole("button", { name: "Custom goal", exact: true }).click();
  await choose(page, "Puzzle", "3×3");
  await choose(page, "Result", "Single");
  await page.getByLabel("Target (seconds)", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Add goal", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Enter a time" }).waitFor();
  await page.getByLabel("Target (seconds)", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Add goal", exact: true }).click();
  assert.equal(await drafts.count(), 2);
  await fits(SIZES, "goals");
  await page.setViewportSize({ width: 360, height: 640 }); await shot("setup-mobile");
  await page.setViewportSize({ width: 1280, height: 800 });
  await next();

  await heading("All set");
  await page.getByRole("button", { name: "Edit level", exact: true }).click(); await heading("Your level");
  await page.getByRole("button", { name: "Ready", exact: true }).click(); await heading("All set");
  await fits(SIZES, "summary");
  await page.getByRole("button", { name: "Start the tour", exact: true }).click();
  await page.locator(".journey-setup").waitFor({ state: "detached" });
  await tour("desktop", { desktop: true });

  const goals = page.locator('[aria-label="Personal goals"]');
  await goals.locator("article").first().waitFor();
  assert.equal(await goals.locator("article").count(), 2);
  await page.evaluate(() => window.cubix.call("addSolve", { puzzle: "333", solveMode: "standard", scrambleType: "normal", timeMs: 19000 }));
  await goals.locator('article[data-complete="true"]').first().waitFor();

  // The goal editor: shadcn dialog, validation, cancel.
  await goals.getByRole("button", { name: "Add goal", exact: true }).click();
  await heading("Add goal");
  const dialog = page.getByRole("dialog", { name: "Add goal", exact: true });
  await dialog.getByLabel("Target (seconds)").fill("0"); await dialog.getByRole("button", { name: "Add goal", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Enter a time" }).waitFor();
  await dialog.getByLabel("Target (seconds)").fill("12.5");
  await dialog.getByRole("button", { name: "Deadline (optional)", exact: true }).click();
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await page.locator('[aria-label="Days"] button:not(:disabled)').nth(14).click();
  assert.ok(!(await dialog.getByRole("button", { name: "Deadline (optional)", exact: true }).textContent())?.includes("No deadline"));
  await shot("goal-dialog-desktop");
  await dialog.getByRole("button", { name: "Add goal", exact: true }).click();
  await dialog.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Personal goals"] article').length === 3);
  await goals.getByRole("button", { name: "Add goal", exact: true }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.waitFor({ state: "detached" });

  // Replay the tour from the guides; Tab stays in the tour, Escape ends it.
  await page.locator('[data-action="help"]').first().click();
  await page.getByRole("button", { name: "Replay tour", exact: true }).click();
  await heading(TOUR_STEPS[0].title);
  await bounded(".journey-tour-card");
  await page.keyboard.press("Tab"); assert.equal(await page.locator(".journey-tour").evaluate(n => n.contains(document.activeElement)), true);
  await page.keyboard.press("ArrowRight"); await heading(TOUR_STEPS[1].title);
  await page.keyboard.press("Escape"); await page.locator(".journey-tour").waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-app-shell]").evaluate((n: HTMLElement) => n.inert), false);

  // Phones: the card docks at the top or bottom, the whole tour from the profile's replay button.
  await page.setViewportSize({ width: 360, height: 640 });
  await page.locator('[data-action="nav:profile"]:visible').first().click();
  await page.locator('[aria-label="Personal setup"] [data-action="tour"]').click();
  await tour("phone", { desktop: false });
  await page.setViewportSize({ width: 1280, height: 800 });

  // Edit the setup: the saved answers come back.
  await page.locator('[data-action="nav:profile"]').first().click();
  await page.locator('[aria-label="Personal setup"] [data-action="onboarding"]').click(); await heading("Your level");
  assert.equal(await page.getByRole("radio", { name: /^Beginner/ }).getAttribute("aria-checked"), "true");
  await next(); await heading("Puzzles you can solve"); assert.equal(await checked("3×3"), true); assert.equal(await checked("3×3 CFOP"), true);
  await next(); await heading("What do you want to learn?");
  assert.equal(await checked("2×2"), true); assert.equal(await checked("4×4"), true); assert.equal(await checked("4×4 Yau"), true);
  await checkbox("4×4").click(); await checkbox("2×2").click();
  await next(); await heading("Your goals"); await next(); await heading("All set");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".journey-setup").waitFor({ state: "detached" });
  await page.reload(); await page.locator(".rail").waitFor();
  await page.waitForTimeout(600); assert.equal(await page.locator(".journey-setup").count(), 0);

  // Redo the introduction from the guides, then cancel back to the app.
  await page.locator('[data-action="help"]').first().click();
  await page.getByRole("button", { name: "Redo the introduction", exact: true }).click(); await heading("Your level");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator(".rail").waitFor();
  assert.notEqual(new URL(page.url()).pathname, "/onboarding");

  // Routing: shortcuts, deep links, reload and history.
  assert.deepEqual(await page.locator('[aria-label="Sections"] [data-action^="nav:"]').evaluateAll(nodes => nodes.map(n => n.getAttribute("data-action"))), ["nav:playground", "nav:algorithms", "nav:training", "nav:duel", "nav:learn"]);
  await page.locator('[data-action="nav:profile"]').first().click(); await page.waitForURL("**/profile*");
  for (const [key, pathname] of [["1", "/timer"], ["2", "/algorithms"], ["3", "/training"], ["4", "/duel"], ["5", "/learn"]]) {
    await page.keyboard.press("Alt+" + key);
    await page.waitForURL(url => url.pathname === pathname);
  }
  await page.keyboard.press("Alt+6"); assert.equal(new URL(page.url()).pathname, "/learn");
  await page.locator('[data-action="nav:profile"]').first().click();
  await page.locator('[data-action="nav:algorithms"]').first().click(); await page.waitForURL("**/algorithms?*");
  await page.goBack(); await page.waitForURL("**/profile?*");
  await page.goForward(); await page.waitForURL("**/algorithms?*");
  await page.goto(origin + "/learn/ortega?puzzle=222");
  await page.waitForSelector('[data-action="learnMethods"]');
  await page.reload(); await page.waitForSelector('[data-action="learnMethods"]');
  assert.equal(new URL(page.url()).pathname, "/learn/ortega");
  await page.goto(origin + "/learn/ortega?puzzle=222&step=1");
  await page.waitForSelector('[data-action="learnMethods"]');
  assert.equal(new URL(page.url()).searchParams.get("step"), "1");
  await page.goto(origin + "/profile/playground?puzzle=333");
  await page.waitForSelector('[data-action="profileMode:overview"]');
  assert.equal(new URL(page.url()).pathname, "/profile/playground");

  await page.setViewportSize({ width: 1600, height: 900 });
  assert.equal(await page.locator('[data-action="menu:account"]').count(), 0);
  await page.locator('[data-action="logout"]').first().click();
  await page.locator(".rail").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("Onboarding (welcome, level, puzzles with inline methods, learning, suggested and custom goals, summary) at five sizes without page scroll, Enter/arrow keys, the goal dialog, the tour's tab and in-page cut-outs on desktop and phone, replay and redo from the guides, edit/cancel, routing and logout passed.");
} catch (error) {
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/failure.png` });
  await Bun.write(`${SHOTS}/failure.html`, await page.content());
  throw error;
} finally { await browser.close(); server.kill(); await server.exited; await rm(dir, { recursive: true, force: true }); }
