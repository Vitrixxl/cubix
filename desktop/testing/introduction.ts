/** Onboarding and the app tour on the real web UI: headless Chromium, disposable account/storage/API. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
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

try {
  await page.goto(origin); await signIn(page, "introduction_ui", "a-long-test-password", true);
  await heading("Welcome to Cubix");
  assert.equal(new URL(page.url()).pathname, "/onboarding");
  for (const name of ["Later", "Close", "Cancel"]) assert.equal(await page.getByRole("button", { name, exact: true }).count(), 0, `no ${name} on a first onboarding`);
  await page.keyboard.press("Escape"); await heading("Welcome to Cubix");
  await page.goto(origin + "/duel"); await heading("Welcome to Cubix");
  assert.equal(new URL(page.url()).pathname, "/onboarding");
  await fits(SIZES, "welcome");
  // Enter continues from the page; no level is asked, only what can be solved.
  await page.keyboard.press("Enter"); await heading("What can you solve?");
  assert.equal(await page.getByRole("radio").count(), 0, "no level cards");

  assert.equal(await checked("None yet"), true);
  await checkbox("3×3").click();
  assert.equal(await checked("None yet"), false);
  await checkbox("3×3 CFOP").click(); await checkbox("3×3 Roux").click();
  assert.equal(await checked("3×3 CFOP"), true);
  await checkbox("4×4").click(); await checkbox("4×4 Yau").click();
  // Removing a puzzle removes its methods; picking it again starts empty.
  await checkbox("4×4").click(); assert.equal(await checkbox("4×4 Yau").count(), 0);
  await checkbox("4×4").click(); assert.equal(await checked("4×4 Yau"), false);
  await checkbox("4×4").click();
  await fits(SIZES, "known");
  await page.setViewportSize({ width: 360, height: 640 }); await shot("setup-mobile");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Start the tour", exact: true }).click();
  await page.locator(".journey-setup").waitFor({ state: "detached" });
  await tour("desktop", { desktop: true });
  assert.equal(new URL(page.url()).searchParams.get("puzzle") ?? "333", "333");
  assert.equal(await page.locator("[data-locked]").count(), 0, "a puzzle that can be solved opens every section");

  // The profile keeps the figures and the practice: no journey or goal panel any more.
  await page.locator('[data-action="nav:profile"]').first().click();
  await page.locator('[data-tour="profile-overview"]').waitFor();
  assert.equal(await page.locator('[aria-label="Personal goals"], [aria-label="Personal setup"]').count(), 0, "no journey or goals on the profile");

  // Replay the tour from the guides; Tab stays in the tour, Escape ends it.
  await page.locator('[data-action="help"]').first().click();
  await page.getByRole("button", { name: "Replay tour", exact: true }).click();
  await heading(TOUR_STEPS[0].title);
  await bounded(".journey-tour-card");
  await page.keyboard.press("Tab"); assert.equal(await page.locator(".journey-tour").evaluate(n => n.contains(document.activeElement)), true);
  await page.keyboard.press("ArrowRight"); await heading(TOUR_STEPS[1].title);
  await page.keyboard.press("Escape"); await page.locator(".journey-tour").waitFor({ state: "detached" });
  assert.equal(await page.locator("[data-app-shell]").evaluate((n: HTMLElement) => n.inert), false);

  // Phones: the card docks at the top or bottom, the whole tour from the guides, in the profile's menu.
  await page.setViewportSize({ width: 360, height: 640 });
  await page.locator('[data-action="nav:profile"]:visible').first().click();
  await page.locator('[data-action="menu:more"]:visible').first().click();
  await page.getByRole("menuitem", { name: "Guides" }).click();
  await page.getByRole("button", { name: "Replay tour", exact: true }).click();
  await tour("phone", { desktop: false });
  await page.setViewportSize({ width: 1280, height: 800 });

  // A puzzle that cannot be solved yet: picking it asks to learn it, and only Learn stays open on it.
  const puzzlePick = async (label: string) => {
    await page.locator('.rail [data-action="menu:puzzles"]').click();
    await page.getByRole("option", { name: label, exact: true }).click();
  };
  const learnDialog = (name: string) => page.getByRole("dialog", { name: `Learn to solve the ${name}?`, exact: true });
  const skipDialog = page.getByRole("dialog", { name: "Skip the tutorial?", exact: true });
  await page.locator('[data-action="nav:algorithms"]').first().click(); await page.waitForURL("**/algorithms?*");
  await puzzlePick("4×4");
  await learnDialog("4×4").waitFor();
  await page.waitForURL(url => url.pathname === "/learn" && url.searchParams.get("puzzle") === "444");
  assert.deepEqual(await page.locator('.rail [data-locked]').evaluateAll(nodes => nodes.map(n => n.getAttribute("data-action"))), ["nav:playground", "nav:algorithms", "nav:training", "nav:duel"]);
  await shot("learn-puzzle-dialog");
  // Not now: back to the 3×3 and the page it was on.
  await learnDialog("4×4").getByRole("button", { name: "Not now", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/algorithms" && url.searchParams.get("puzzle") === "333");
  assert.equal(await page.locator("[data-locked]").count(), 0);
  // Start learning opens the recommended course.
  await puzzlePick("4×4");
  await learnDialog("4×4").getByRole("button", { name: "Start learning", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/learn/reduction" && url.searchParams.get("puzzle") === "444");
  assert.equal(await page.locator('[data-action^="train:"]').count(), 0, "no training from a course while the puzzle is locked");
  // A greyed section offers to skip the tutorial: from a click, a shortcut or a link.
  await page.locator('.rail [data-action="nav:playground"]').click();
  await skipDialog.waitFor(); await shot("skip-tutorial-dialog");
  await skipDialog.getByRole("button", { name: "Keep learning", exact: true }).click();
  await skipDialog.waitFor({ state: "detached" });
  assert.equal(new URL(page.url()).pathname, "/learn/reduction");
  await page.keyboard.press("Alt+3"); await skipDialog.waitFor();
  await page.keyboard.press("Escape"); await skipDialog.waitFor({ state: "detached" });
  await page.goto(origin + "/timer?puzzle=444");
  await page.waitForURL(url => url.pathname === "/learn" && url.searchParams.get("puzzle") === "444");
  await page.locator('.rail [data-action="nav:training"]').click();
  await skipDialog.getByRole("button", { name: "Skip the tutorial", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/training" && url.searchParams.get("puzzle") === "444");
  assert.equal(await page.locator("[data-locked]").count(), 0, "skipping the tutorial opens every section");
  // "Unlock everything" opens every section of the puzzle, on its timer.
  await puzzlePick("2×2");
  await learnDialog("2×2").getByRole("button", { name: "Unlock everything", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/timer" && url.searchParams.get("puzzle") === "222");
  assert.equal(await page.locator("[data-locked]").count(), 0);
  // A puzzle the player can solve opens on its timer, wherever they were.
  await page.locator('[data-action="nav:algorithms"]').first().click(); await page.waitForURL("**/algorithms?*");
  await puzzlePick("3×3");
  await page.waitForURL(url => url.pathname === "/timer" && url.searchParams.get("puzzle") === "333");
  await page.locator('[data-action="nav:training"]').first().click(); await page.waitForURL("**/training?*");
  await puzzlePick("2×2");
  await page.waitForURL(url => url.pathname === "/timer" && url.searchParams.get("puzzle") === "222");
  // Finishing a course opens the puzzle.
  await puzzlePick("5×5");
  await learnDialog("5×5").getByRole("button", { name: "Start learning", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/learn/reduction" && url.searchParams.get("puzzle") === "555");
  await page.goto(origin + "/learn/reduction?puzzle=555&step=3");
  await page.locator('[data-action="learnFinish"]').click();
  await page.locator("[data-finished]").waitFor();
  await page.waitForFunction(() => !document.querySelector("[data-locked]"));
  await page.locator('[data-finished] [data-action="nav:playground"]').click();
  await page.waitForURL(url => url.pathname === "/timer" && url.searchParams.get("puzzle") === "555");

  // Edit the setup from the guides: the saved answers come back, with the puzzles unlocked since.
  await page.locator('[data-action="help"]').first().click();
  await page.getByRole("button", { name: "Redo the introduction", exact: true }).click(); await heading("What can you solve?");
  for (const name of ["3×3", "3×3 CFOP", "3×3 Roux", "4×4", "2×2", "5×5", "5×5 Reduction"]) assert.equal(await checked(name), true, `${name} is known`);
  await checkbox("2×2").click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator(".journey-setup").waitFor({ state: "detached" });
  await page.reload(); await page.locator(".rail").waitFor();
  await page.waitForTimeout(600); assert.equal(await page.locator(".journey-setup").count(), 0);

  // Redo the introduction from the guides, then cancel back to the app.
  await page.locator('[data-action="help"]').first().click();
  await page.getByRole("button", { name: "Redo the introduction", exact: true }).click(); await heading("What can you solve?");
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
  // The 2×2 is no longer known: its course is still open.
  await page.goto(origin + "/learn/ortega?puzzle=222");
  await page.waitForSelector('[data-action="learnMethods"]');
  await page.reload(); await page.waitForSelector('[data-action="learnMethods"]');
  assert.equal(new URL(page.url()).pathname, "/learn/ortega");
  await page.goto(origin + "/learn/ortega?puzzle=222&step=1");
  await page.waitForSelector('[data-action="learnMethods"]');
  assert.equal(new URL(page.url()).searchParams.get("step"), "1");
  await page.goto(origin + "/algorithms?puzzle=222");
  await page.waitForURL(url => url.pathname === "/learn" && url.searchParams.get("puzzle") === "222");
  await page.goto(origin + "/profile/playground?puzzle=333");
  await page.waitForSelector('[data-action="profileMode:overview"]');
  assert.equal(new URL(page.url()).pathname, "/profile/playground");

  await page.setViewportSize({ width: 1600, height: 900 });
  assert.equal(await page.locator('[data-action="menu:account"]').count(), 0);
  await page.locator('[data-action="logout"]').first().click();
  await page.locator(".rail").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("Onboarding (welcome, puzzles with inline methods) at five sizes without page scroll, Enter, no goals on the profile, puzzle locking (learn dialog, greyed sections, skip, finish), the tour's tab and in-page cut-outs on desktop and phone, replay and redo from the guides, edit/cancel, routing and logout passed.");
} catch (error) {
  await mkdir(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/failure.png` });
  await Bun.write(`${SHOTS}/failure.html`, await page.content());
  throw error;
} finally { await browser.close(); server.kill(); await server.exited; await rm(dir, { recursive: true, force: true }); }
