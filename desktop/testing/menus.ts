/** Screenshots of what the grid walker does not open: the solve context menu, the header menus, the puzzle picker,
 * the solve dialog and the light theme. Headless Chromium against a disposable API serving the web build.
 * Build first: `bun run build:api && bun desktop/web.ts`. Saves into artifacts/menus. */
import { chromium, type Page } from "playwright";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "./app";

const SHOTS = "artifacts/menus";
await mkdir(SHOTS, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), "cubix-menus-"));
const { origin, server } = await startServer(join(dir, "server"), { CUBIX_RATE_LIMIT: "100000" });
const browser = await chromium.launch({ executablePath: process.env.CUBIX_TEST_CHROMIUM ?? "/usr/bin/chromium", headless: true });

const settle = (page: Page) => page.waitForSelector("[data-exiting]", { state: "detached" }).then(() => page.waitForTimeout(300));
const act = async (page: Page, action: string) => {
  await page.locator(`[data-action="${action}"]`).first().click();
  await settle(page);
};
async function solve(page: Page) {
  await page.waitForFunction(() => !!document.querySelector(".scramble .alg") && /release to start/.test(document.querySelector(".timer-hint")?.textContent ?? ""));
  await page.keyboard.down("Space");
  await page.waitForSelector('.timer[data-phase="Ready"]');
  await page.keyboard.up("Space");
  await page.waitForSelector('.timer[data-phase="Running"]');
  await page.waitForTimeout(150 + Math.random() * 300);
  await page.keyboard.press("a");
  await page.waitForSelector('.timer[data-phase="Idle"]');
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png` });

try {
  const [width, height] = (process.argv.find((a) => /^\d+x\d+$/.test(a)) ?? "1440x900").split("x").map(Number);
  const context = await browser.newContext({ viewport: { width: width!, height: height! } });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("page error:", e.message));
  await page.goto(origin);
  await page.waitForSelector(".timer");
  await page.waitForFunction(() => !!document.querySelector(".scramble .alg"), undefined, { timeout: 60000 });
  for (let i = 0; i < 7; i++) await solve(page);
  await page.waitForTimeout(400);
  await shot(page, "timer");
  // Right-click on the newest chip of the Ao5 window.
  await page.locator(".average-window button").last().click({ button: "right" });
  await page.waitForSelector("[data-slot=context-menu-content]");
  await page.waitForTimeout(250);
  await shot(page, "context-menu-chip");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  // +2 from the menu of a row of the times list.
  const row = page.locator('.times-list [data-action^="solve:"]').nth(1);
  await row.click({ button: "right" });
  await page.waitForSelector("[data-slot=context-menu-content]");
  await page.waitForTimeout(250);
  await shot(page, "context-menu-row");
  await page.getByRole("menuitemradio", { name: "+2" }).click();
  await page.waitForTimeout(500);
  await shot(page, "after-plus-two");
  // Header menu and puzzle picker.
  await page.locator('[data-action="menu:scrambleType"]').click();
  await page.waitForTimeout(300);
  await shot(page, "scramble-menu");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.locator('[data-action="menu:puzzles"]').first().click();
  await page.waitForTimeout(300);
  await shot(page, "puzzle-picker");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  // The solve dialog, from a chip.
  await page.locator(".average-window button").first().click();
  await page.waitForTimeout(400);
  await shot(page, "solve-dialog");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(300);
  await page.keyboard.type("pll t");
  await page.waitForTimeout(300);
  await shot(page, "search");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // Light theme.
  await act(page, "settings");
  await page.locator('[data-action="light:light"]').click();
  await page.waitForTimeout(300);
  await shot(page, "settings-light");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await shot(page, "timer-light");
  await page.locator(".average-window button").last().click({ button: "right" });
  await page.waitForTimeout(300);
  await shot(page, "context-menu-light");
  await page.keyboard.press("Escape");
  await act(page, "nav:algorithms");
  await page.locator(".case-row-open").nth(2).click();
  await settle(page);
  await shot(page, "case-light");
  await act(page, "nav:profile");
  await shot(page, "profile-light");
  await act(page, "profileMode:playground");
  await shot(page, "profile-playground-light");
  await act(page, "nav:training");
  await shot(page, "training-light");
  await context.close();
} finally {
  await browser.close();
  server.kill();
  await rm(dir, { recursive: true, force: true });
}
