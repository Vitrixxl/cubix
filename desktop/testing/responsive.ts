/** Every screen at phone and desktop window sizes: the page never scrolls, nothing leaves the window,
 * the practice prompt, timer and metrics never overlap. Screenshots go to artifacts/electron/testing. */
import { SHOTS, act, launchApp, resize, scrambled, startServer } from "./app";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SIZES = [[1600, 900], [1280, 800], [1024, 600], [800, 600], [640, 480], [390, 844], [360, 640]] as const;
const dir = await mkdtemp(join(tmpdir(), "cubix-responsive-"));
const { origin, server } = await startServer(join(dir, "server"));
const { app, page, errors } = await launchApp({ dir, origin });
await mkdir(SHOTS, { recursive: true });

/** Layout problems of the current screen, as readable strings. */
const problems = () => page.evaluate(() => {
  const issues: string[] = [];
  const box = (element: Element) => element.getBoundingClientRect();
  const visible = (element: Element) => { const r = box(element); return r.width > 0 && r.height > 0; };
  const root = document.documentElement;
  if (root.scrollHeight > innerHeight || root.scrollWidth > innerWidth) issues.push("the page scrolls");
  const nav = document.querySelector(".nav");
  const inWindow = (selector: string) => {
    for (const element of document.querySelectorAll(selector)) {
      if (!visible(element)) continue;
      const r = box(element);
      if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) issues.push(`${selector} outside the window`);
      else if (nav?.classList.contains("tabbar") && !element.closest(".nav") && r.bottom > box(nav).top + 1) issues.push(`${selector} under the tab bar`);
    }
  };
  inWindow(".nav .button");
  // The header controls scroll sideways on phones when they do not fit; the title row must fit.
  inWindow(".page-title .button");
  for (const element of document.querySelectorAll(".page-head, .page-title"))
    if (element.scrollWidth > element.clientWidth + 1) issues.push(`.${element.className.split(" ")[0]} clipped`);
  const practice = document.querySelector(".page.practice");
  if (practice) {
    inWindow(".prompt .button");
    inWindow(".timer-digits");
    inWindow(".solve-actions .button");
    inWindow(".metrics .metric");
    const [prompt, timer, metrics] = [".prompt", ".timer", ".metrics"].map((selector) => box(document.querySelector(selector)!));
    if (prompt.bottom > timer.top + 1) issues.push("the prompt overlaps the timer");
    if (timer.bottom > metrics.top + 1) issues.push("the timer overlaps the metrics");
    const cube = document.querySelector(".cube-box"), digits = document.querySelector(".timer-digits");
    if (cube && digits) {
      const [c, d] = [box(cube), box(digits)];
      if (c.left < d.right - 1 && c.bottom > d.top + 1) issues.push("the cube overlaps the timer");
    }
    for (const element of document.querySelectorAll(".prompt-text")) {
      const alg = element.querySelector(".alg");
      if (alg && element.clientHeight + 1 < Math.min(element.scrollHeight, parseFloat(getComputedStyle(alg).lineHeight))) issues.push("an algorithm has less than one readable line");
    }
  }
  const overview = document.querySelector(".overview");
  if (overview) {
    const r = box(overview);
    for (const element of overview.querySelectorAll(".ov-card, .ov-hero-figure, .ov-bests")) {
      const b = box(element);
      if (b.width && (b.left < r.left - 1 || b.right > r.right + 1)) issues.push(`.${element.className.split(" ").at(-1)} outside the overview`);
      if (element.scrollWidth > element.clientWidth + 1) issues.push(`.${element.className.split(" ").at(-1)} clipped`);
    }
  }
  return [...new Set(issues)];
});

/** Checks the current screen at every size, then goes back to the desktop size. */
const failures: string[] = [];
async function check(name: string) {
  for (const [width, height] of SIZES) {
    await resize(page, width, height);
    await page.waitForSelector("[data-exiting]", { state: "detached" });
    await page.waitForTimeout(250);
    // Phones show the session times in a sheet over the practice: close it to check the practice itself.
    const sheet = page.locator(".sheet-backdrop");
    if (await sheet.count()) {
      await sheet.click({ position: { x: 4, y: 4 } });
      await sheet.waitFor({ state: "detached" });
    }
    await page.screenshot({ path: `${SHOTS}/${name}-${width}x${height}.png` });
    for (const problem of await problems()) {
      failures.push(`${name} ${width}×${height}: ${problem}`);
      console.error(failures.at(-1));
    }
  }
  await resize(page, 1280, 800);
  await page.waitForTimeout(250);
  console.log(name);
}

try {
  await page.waitForSelector(".timer");
  await scrambled(page);
  await check("timer");
  // A typed time shows the actions of the last solve under the timer.
  await act(page, "menu:entries");
  await page.getByRole("option", { name: "Typing", exact: true }).click();
  await page.getByRole("textbox", { name: "Time", exact: true }).fill("1234");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-action^="penalty:"]');
  await act(page, "menu:entries");
  await page.getByRole("option", { name: "Timer", exact: true }).click();
  await check("timer-solved");

  await act(page, "nav:algorithms");
  await page.waitForSelector(".algorithms-page");
  await check("algorithms");
  await act(page, "case:F2L 1");
  await check("case"); // opened beside the list on desktop, as a page of its own on phones

  await act(page, "nav:training");
  await page.waitForSelector(".training-setup");
  await check("training-setup");
  await act(page, "setupMode:practice");
  await act(page, "selectSet:f2l");
  await act(page, "trainingStart:cases:practice");
  await page.waitForSelector(".case-title");
  await act(page, "solution");
  await check("training");
  await act(page, "trainingSetup");
  await act(page, "setupMode:cross1");
  await act(page, "trainingStart:cross1");
  await scrambled(page);
  await check("cross-plus-one");

  await act(page, "nav:profile");
  await page.waitForSelector(".overview");
  await check("profile");

  assert.deepEqual(failures, []);
  assert.deepEqual(errors, []);
  console.log(`Timer, algorithms, case, training and profile fit every size from ${SIZES.at(-1)!.join("×")} to ${SIZES[0].join("×")}`);
} finally {
  await app.close();
  server.kill();
  await rm(dir, { recursive: true, force: true });
}
