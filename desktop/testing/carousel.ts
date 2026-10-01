/** Section switches slide as a vertical carousel: the new page comes from below (later section) or above, the old one leaves the other way. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { startServer, signIn } from "./app";

const dir = await mkdtemp(join(tmpdir(), "cubix-carousel-"));
const { origin, server } = await startServer(dir);
const browser = await chromium.launch({ executablePath: process.env.CUBIX_TEST_CHROMIUM ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const errors: string[] = [];

/** Mid-way through the slide: the vertical offsets of the leaving page and of the arriving one, in window heights. */
async function midway(page: Page, action: string) {
  await page.locator(`[data-action="${action}"]`).first().click();
  await page.waitForSelector("[data-exiting]");
  await page.waitForTimeout(120);
  const offsets = await page.evaluate(() => {
    const frames = [...(document.querySelector("[data-exiting]")?.parentElement?.children ?? [])];
    const y = (e: Element | undefined) => (e ? e.getBoundingClientRect().top - e.parentElement!.getBoundingClientRect().top : NaN) / innerHeight;
    return { leaving: y(frames.find(e => e.hasAttribute("data-exiting"))), arriving: y(frames.find(e => !e.hasAttribute("data-exiting"))) };
  });
  await page.waitForSelector("[data-exiting]", { state: "detached" });
  return offsets;
}

try {
  for (const [width, height] of [[1280, 800], [390, 844]] as const) {
    const page = await (await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" })).newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(origin);
    await signIn(page, "carousel_ui");
    await page.goto(origin + "/timer");
    await page.waitForSelector(".rail, .tabbar");
    await page.waitForTimeout(500);
    const down = await midway(page, "nav:training");
    assert.ok(down.arriving > 0.05 && down.leaving < -0.05, `${width}px: a later section arrives from below (${JSON.stringify(down)})`);
    await mkdir("artifacts/carousel", { recursive: true });
    const up = await midway(page, "nav:algorithms");
    assert.ok(up.arriving < -0.05 && up.leaving > 0.05, `${width}px: an earlier section arrives from above (${JSON.stringify(up)})`);
    await page.locator('[data-action="nav:duel"]').first().click();
    await page.waitForSelector("[data-exiting]");
    await page.waitForTimeout(150);
    await page.screenshot({ path: `artifacts/carousel/midway-${width}.png` });
    await page.context().close();
  }
  assert.deepEqual(errors, []);
  console.log("Vertical carousel between sections, both directions, desktop and phone, passed.");
} finally {
  await browser.close();
  server.kill();
  await server.exited;
  await rm(dir, { recursive: true, force: true });
}
