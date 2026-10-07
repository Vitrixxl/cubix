/** Screenshots of Learn, its 3D player and the notation guide, headless, at a desktop and a phone size, against a
 * disposable API serving the web build. Build first: `bun desktop/web.ts`. `--before` only shoots the screens that
 * existed before the player (to compare), into artifacts/learn-3d/before-*. */
import { chromium, type Page } from "playwright";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signIn, startServer } from "./app";

const OUT = "artifacts/learn-3d";
const before = process.argv.includes("--before");
const prefix = before ? "before-" : "";
await mkdir(OUT, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), "cubix-learn3d-"));
const { server, origin } = await startServer(join(dir, "server"), { CUBIX_RATE_LIMIT: "100000" });
const browser = await chromium.launch({ executablePath: process.env.CUBIX_TEST_CHROMIUM ?? "/usr/bin/chromium", headless: true });

const settle = (page: Page) => page.waitForTimeout(300);
async function act(page: Page, action: string) {
  const target = page.locator(`[data-action="${action}"]:visible`);
  if (!(await target.count()) && (await page.locator('[data-action="menu:more"]:visible').count())) {
    await page.locator('[data-action="menu:more"]:visible').first().click();
    await page.waitForTimeout(250);
  }
  await target.first().click();
  await settle(page);
}
async function openMethod(page: Page, id: string) {
  // Learn opens on the choice between methods and algorithms; the methods are a step further.
  if (!(await page.locator(`[data-action="learnMethod:${id}"]:visible`).count())) await act(page, "learnMethods");
  await act(page, "learnMethod:" + id);
}
async function learnStep(page: Page, index: number) {
  if (!(await page.locator(`[data-action="learnStep:${index}"]:visible`).count())) await act(page, "learnSteps");
  await act(page, "learnStep:" + index);
  // Ahead of steps not done, it asks whether they were finished: just open the step.
  if (await page.locator('[data-action="learnJump:open"]:visible').count()) await act(page, "learnJump:open");
}
const shot = async (page: Page, name: string) => {
  await settle(page);
  await page.screenshot({ path: `${OUT}/${prefix}${name}-${page.viewportSize()!.width}.png` });
};
const close = async (page: Page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
};

try {
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/timer");
    await signIn(page, `learn3d_${width}${before ? "b" : ""}`);
    await page.waitForSelector("[data-phase]", { timeout: 60000 });
    await act(page, "nav:learn");
    await openMethod(page, "beginner");
    await learnStep(page, 3);
    await shot(page, "beginner-yellow-cross");
    await learnStep(page, 4);
    await shot(page, "beginner-yellow-face");
    if (!before) {
      // The player mid-playback: the Sune case, played at its third move.
      await page.locator("[data-play]:visible").first().click();
      await page.waitForSelector("[data-player-controls]");
      await page.waitForTimeout(400);
      await page.locator("[data-move='2']:visible").first().click();
      await page.waitForTimeout(260);
      await page.screenshot({ path: `${OUT}/player-learn-${width}.png` });
      await page.getByRole("button", { name: "Restart", exact: true }).click();
      await page.getByRole("button", { name: "Next move (→)", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-move="0"]')?.getAttribute("aria-current") === "step");
      await page.getByRole("button", { name: "Previous move (←)", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector('[data-move][aria-current="step"]'));
      const canvas = page.locator("canvas[data-player-cube]:visible");
      const beforeDrag = await canvas.evaluate((e: HTMLCanvasElement) => e.toDataURL());
      const bounds = (await canvas.boundingBox())!;
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width / 2 + 50, bounds.y + bounds.height / 2 + 20, { steps: 5 });
      await page.mouse.up();
      assert.notEqual(await canvas.evaluate((e: HTMLCanvasElement) => e.toDataURL()), beforeDrag, "Dragging rotates the cube");
      await close(page);
      await settle(page);
      // The last step's Finish, then the completion state.
      await learnStep(page, 5);
      await shot(page, "beginner-last-step");
      await act(page, "learnFinish");
      await shot(page, "beginner-finished");
    }
    if (!before) await act(page, "learnMethods");
    else await act(page, "learnMethods");
    await openMethod(page, "cfop");
    await learnStep(page, 2);
    await shot(page, "cfop-oll");
    if (!before) {
      await act(page, "notation");
      await page.waitForTimeout(700);
      await shot(page, "notation");
      await page.locator('[data-action="notationMove:L\'"], [data-action="notationMove:M"]').first().click();
      await page.waitForTimeout(450);
      await page.screenshot({ path: `${OUT}/notation-slice-${width}.png` });
      await close(page);
    }
    await act(page, "nav:algorithms");
    await page.locator("[data-action^='case:']").first().click();
    await settle(page);
    if (!before) {
      await page.waitForTimeout(900);
    }
    await shot(page, "case");
    if (!before) {
      await page.locator("[data-play]:visible").first().click();
      await page.waitForSelector("[data-player-controls]");
      await shot(page, "player-case");
      await close(page);
    }
    if (!before) {
      if (width < 700) await act(page, "nav:profile");
      await act(page, "help");
      await act(page, "guidePage:notationGuide");
      await page.waitForTimeout(600);
      await shot(page, "guide-notation");
      await close(page);
    }
    assert.deepEqual(errors, [], `No page errors at ${width}`);
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log("Shots in", OUT);
