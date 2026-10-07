/** Two players, two tabs of one headless Chromium, race each other against a disposable API serving the web build: matchmaking,
 * the same scrambles, the opponent's live timer, chat, DNF and Cancel, the result, a rematch and the profile's battles.
 * Build first: `bun run build:api && bun desktop/web.ts`. */
import { chromium, type Page } from "playwright";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./app";

const SHOTS = "artifacts/duel";
await mkdir(SHOTS, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), "cubix-duel-"));
const { origin, server } = await startServer(join(dir, "server"));
const browser = await chromium.launch({ executablePath: process.env.CUBIX_TEST_CHROMIUM ?? "/usr/bin/chromium", headless: true });
const errors: string[] = [];
// Both players are tabs of the same browser: they share one engine.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
async function open() {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/timer");
  await page.waitForSelector(".rail, .tabbar");
  await page.locator('[data-action="nav:duel"]').first().click();
  await page.waitForSelector(".duel-lobby");
  return page;
}
/** Nothing sticks out of the window: the screen stays at its height. */
const fits = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll(".page")].every((p) => p.scrollHeight <= p.clientHeight + 1) && document.scrollingElement!.scrollHeight <= innerHeight);
const scrambleOf = (page: Page) => page.locator(".duel-scramble .alg").textContent();
async function solve(page: Page, ms = 150) {
  await page.waitForFunction(() => document.querySelector(".duel-side.mine .timer-hint")?.textContent?.startsWith("Hold Space"));
  await page.keyboard.down("Space");
  await page.waitForSelector(".duel-side.mine.ready");
  await page.keyboard.up("Space");
  await page.waitForSelector(".duel-side.mine.running");
  await page.waitForTimeout(ms);
  await page.keyboard.press("a");
  await page.waitForSelector(".duel-side.mine.idle");
}

try {
  const a = await open(), b = await open();
  assert.equal(await a.locator("[data-sonner-toast]").count() + await b.locator("[data-sonner-toast]").count(), 0, "no tab waits for another");
  assert.ok(await fits(a), "the lobby fits the window");
  await a.screenshot({ path: `${SHOTS}/lobby.png` });
  await a.locator('[data-action="duel:search"]').click();
  await a.waitForSelector(".duel-lobby .setup-start:not(.primary)");
  await b.locator('[data-action="duel:search"]').click();
  await Promise.all([a.waitForSelector(".duel-race"), b.waitForSelector(".duel-race")]);
  await Promise.all([a.waitForSelector(".duel-scramble .alg"), b.waitForSelector(".duel-scramble .alg")]);
  assert.equal(await scrambleOf(a), await scrambleOf(b), "both race the same scramble");
  await a.waitForSelector(".duel-cube canvas");
  assert.ok(await fits(a), "the race fits the window");

  // The opponent's timer runs while A solves.
  await a.keyboard.down("Space");
  await a.waitForSelector(".duel-side.mine.ready");
  await b.waitForSelector(".duel-side.theirs.ready");
  await a.keyboard.up("Space");
  await b.waitForSelector(".duel-side.theirs.running");
  await b.waitForTimeout(400);
  await b.screenshot({ path: `${SHOTS}/opponent-running.png` });
  await a.keyboard.press("a");
  await b.waitForSelector(".duel-side.theirs.idle");
  await b.waitForFunction(() => document.querySelector(".duel-side.theirs .timer-digits")?.textContent !== "0.000");

  // Cancel takes A's solve back while B has not finished; A redoes it.
  await a.locator('[data-action="duel:cancel"]').click();
  await b.waitForFunction(() => document.querySelector(".duel-board-row:not(.mine) .duel-board-cell.mono")?.textContent === "1");
  await solve(a);

  // Chat.
  await b.locator(".duel-chat-form input").fill("gg, next one is mine");
  await b.keyboard.press("Enter");
  await a.waitForSelector(".duel-chat-line:not(.mine)");
  assert.equal(await a.locator(".duel-chat-line:not(.mine) .duel-chat-text").textContent(), "gg, next one is mine");

  await solve(b, 250);
  // A DNF on B's first solve, then the other rounds.
  await b.locator('[data-action="duel:dnf"]').click();
  await a.waitForSelector(".duel-board-row:not(.mine) .duel-board-cell.danger");
  for (let round = 1; round < 5; round++) {
    for (const page of [a, b]) await page.waitForFunction((r) => document.querySelector(".duel-scramble .label")?.textContent?.startsWith(`Round ${r + 1}`), round);
    await solve(a, 120);
    await solve(b, 200);
  }
  await Promise.all([a.waitForSelector(".duel-result"), b.waitForSelector(".duel-result")]);
  await a.waitForTimeout(300);
  assert.equal(await a.locator(".duel-result h2").textContent(), "You win");
  await a.screenshot({ path: `${SHOTS}/result.png` });

  // Rematch: B offers, A accepts, the dialog closes on new scrambles.
  await b.locator('[data-action="duel:rematch"]').click();
  await a.waitForSelector('.duel-result [data-action="duel:rematch"].primary');
  await a.locator('[data-action="duel:rematch"]').click();
  await Promise.all([a.waitForSelector(".duel-result", { state: "detached" }), b.waitForSelector(".duel-result", { state: "detached" })]);
  await a.waitForFunction(() => document.querySelector(".duel-scramble .label")?.textContent?.startsWith("Round 1"));

  // The phone layout of the race.
  await a.setViewportSize({ width: 390, height: 844 });
  await a.waitForSelector(".tabbar");
  assert.ok(await fits(a), "the race fits a phone");
  await a.screenshot({ path: `${SHOTS}/race-phone.png` });
  await a.setViewportSize({ width: 360, height: 740 });
  assert.ok(await a.evaluate(() => [...document.querySelectorAll(".tab-item")].every((t) => t.getBoundingClientRect().top > innerHeight - 80)), "the tab bar holds on one row");
  assert.ok(await fits(a), "the race fits a small phone");
  await a.screenshot({ path: `${SHOTS}/race-phone-360.png` });
  await a.setViewportSize({ width: 1440, height: 900 });

  // Leaving: the opponent is told; the finished battle is in the profile.
  await a.locator('[data-action="duel:leave"]').click();
  await b.waitForSelector(".duel-side.theirs.gone");
  await a.locator('[data-action="nav:profile"]').first().click();
  await a.waitForSelector(".ov-battles .ov-battle");
  assert.ok(await fits(a), "the overview fits the window");
  await a.screenshot({ path: `${SHOTS}/profile.png` });
  await a.locator('[data-action="profileMode:duels"]').click();
  await a.waitForSelector(".battles .battle-row .battle-mark.win");
  await a.screenshot({ path: `${SHOTS}/battles.png` });
  // Each tab kept its side of the race in the shared storage.
  await a.waitForFunction(() => document.querySelectorAll(".battles .battle-row:not(.battle-head)").length === 2);
  assert.deepEqual(errors, []);
  console.log("Duel UI: OK");
} finally {
  await browser.close();
  server.kill();
  await rm(dir, { recursive: true, force: true });
}
