/** Every screen at phone and desktop window sizes: the page never scrolls, nothing leaves the window,
 * the practice prompt, timer and metrics never overlap. Screenshots go to artifacts/electron/testing. */
import { SHOTS, act, launchApp, resize, scrambled, signIn, startServer } from "./app";
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
  // Phones navigate with the tab bar at the foot, the desktop with the sidebar.
  const tabbar = document.querySelector('nav[aria-label="Sections"]');
  const inWindow = (selector: string) => {
    for (const element of document.querySelectorAll(selector)) {
      if (!visible(element)) continue;
      const r = box(element);
      if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) issues.push(`${selector} outside the window`);
      else if (tabbar && !tabbar.contains(element) && r.bottom > box(tabbar).top + 1) issues.push(`${selector} under the tab bar`);
    }
  };
  inWindow('nav[aria-label="Sections"] button');
  inWindow('[data-slot="sidebar"] button');
  // Every page opens with its header: the title and its controls must fit on it.
  inWindow('[data-slot="sidebar-inset"] header button');
  for (const element of document.querySelectorAll('[data-slot="sidebar-inset"] header'))
    if (element.scrollWidth > element.clientWidth + 1) issues.push("the page header is clipped");
  // The practice: the prompt (scramble or case) over the timer, the figures under it.
  const timer = document.querySelector("[data-phase]");
  if (timer) {
    const prompt = timer.previousElementSibling;
    inWindow("[data-phase] > :first-child"); // the digits, or the typed time
    // The controls of the stage: the prompt's, the last solve's and, on phones, the bar at the thumb.
    inWindow("[data-no-timer] button");
    const metrics = document.querySelector('[aria-label="Statistics"], [aria-label="Session times"]');
    if (metrics) inWindow('[aria-label="Statistics"] > *, [aria-label="Session times"]');
    const t = box(timer);
    if (prompt && box(prompt).bottom > t.top + 1) issues.push("the prompt overlaps the timer");
    if (metrics && t.bottom > box(metrics).top + 1) issues.push("the timer overlaps the metrics");
    const cube = prompt?.querySelector('[class~="group/cube"]'), digits = timer.firstElementChild;
    if (cube && digits) {
      const [c, d] = [box(cube), box(digits)];
      if (c.left < d.right - 1 && c.bottom > d.top + 1) issues.push("the cube overlaps the timer");
    }
    for (const alg of prompt?.querySelectorAll(".alg") ?? []) {
      const shown = alg.parentElement!;
      if (shown.clientHeight + 1 < Math.min(shown.scrollHeight, parseFloat(getComputedStyle(alg).lineHeight))) issues.push("an algorithm has less than one readable line");
    }
  }
  // Cards (the profile's, the phone's stage) stay inside the window and are never cut sideways.
  for (const card of document.querySelectorAll('[data-slot="sidebar-inset"] [data-slot="card"]')) {
    const r = box(card);
    if (r.width && (r.left < -1 || r.right > innerWidth + 1)) issues.push("a card outside the window");
    if (card.scrollWidth > card.clientWidth + 1) issues.push("a card clipped");
  }
  return [...new Set(issues)];
});

/** Checks the current screen at every size, then goes back to the desktop size. */
const failures: string[] = [];
async function check(name: string) {
  for (const [width, height] of SIZES) {
    await resize(page, width, height);
    await page.waitForTimeout(250);
    // Phones may show the session times in a sheet over the practice: close it to check the practice itself.
    const sheet = page.locator('[data-slot="drawer-popup"]');
    if (await sheet.count()) {
      await page.keyboard.press("Escape");
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
  // The app is used signed in.
  await signIn(page, "responsive");
  await page.waitForSelector("[data-phase]");
  await scrambled(page);
  await check("timer");
  // A typed time enables the actions of the last solve under the timer.
  await act(page, "menu:entry");
  await page.getByRole("menuitemradio", { name: "Typing", exact: true }).click();
  await page.getByRole("textbox", { name: "Time", exact: true }).fill("1234");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-action^="penalty:"]:not([disabled]):not([data-disabled])');
  await act(page, "menu:entry");
  await page.getByRole("menuitemradio", { name: "Timer", exact: true }).click();
  await check("timer-solved");

  await act(page, "nav:algorithms");
  await page.waitForSelector('[data-action^="case:"]');
  await check("algorithms");
  await act(page, "case:F2L 1");
  await check("case"); // opened beside the list on desktop, as a page of its own on phones

  await act(page, "nav:training");
  await page.waitForSelector('[data-action^="setupMode:"]');
  await check("training-setup");
  await act(page, "setupMode:practice");
  await act(page, "selectSet:f2l");
  await act(page, "trainingStart:cases:practice");
  await page.waitForSelector('[data-action="solution"]');
  await act(page, "solution");
  await check("training");
  await act(page, "trainingSetup");
  await act(page, "setupMode:cross");
  await act(page, "trainingStart:cross");
  await scrambled(page);
  await check("cross-training");

  await act(page, "nav:profile");
  await page.waitForSelector('[data-action^="profileMode:"]');
  await check("profile");

  assert.deepEqual(failures, []);
  assert.deepEqual(errors, []);
  console.log(`Timer, algorithms, case, training and profile fit every size from ${SIZES.at(-1)!.join("×")} to ${SIZES[0].join("×")}`);
} finally {
  await app.close();
  server.kill();
  await rm(dir, { recursive: true, force: true });
}
