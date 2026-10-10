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
  // Phones navigate with the tab bar at the foot, the desktop with the header.
  const tabbar = document.querySelector('.tabbar');
  const inWindow = (selector: string) => {
    for (const element of document.querySelectorAll(selector)) {
      if (!visible(element)) continue;
      const r = box(element);
      if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) issues.push(`${selector} outside the window`);
      else if (tabbar && !tabbar.contains(element) && r.bottom > box(tabbar).top + 1) issues.push(`${selector} under the tab bar`);
    }
  };
  inWindow('.tabbar a');
  inWindow('.topbar a, .topbar button');
  // Every page opens with its header: the title and its controls must fit on it.
  inWindow('[data-slot="app-main"] header button');
  for (const element of document.querySelectorAll('[data-slot="app-main"] header'))
    if (element.scrollWidth > element.clientWidth + 1) issues.push("the page header is clipped");
  // The practice: the prompt (scramble or case) over the timer, the figures under it.
  const timer = document.querySelector("[data-phase]");
  if (timer) {
    const prompt = timer.previousElementSibling;
    inWindow("[data-phase] > :first-child"); // the digits, or the typed time
    // The controls of the stage: the prompt's, the last solve's and, on phones, the bar at the thumb.
    inWindow("[data-no-timer] button");
    inWindow('[aria-label="Statistics"] > *, [aria-label="Session times"]');
    // The timer as drawn, for what lies under it: its digits and lines may spill out of a squeezed section.
    const parts = [timer, ...timer.children].filter(visible).map(box),
      t = { top: Math.min(...parts.map((r) => r.top)), bottom: Math.max(...parts.map((r) => r.bottom)), left: Math.min(...parts.map((r) => r.left)), right: Math.max(...parts.map((r) => r.right)) };
    if (prompt && box(prompt).bottom > box(timer).top + 1) issues.push("the prompt overlaps the timer");
    // What sits under the timer: the figures, the session times, a training's last solve and attempts (not a column beside it).
    for (const under of document.querySelectorAll('[aria-label="Statistics"], [aria-label="Session times"], [aria-label="Last solve"], [aria-label="Attempts of the session"]')) {
      const m = box(under);
      if (visible(under) && m.left < t.right - 1 && m.right > t.left + 1 && m.top > t.top && t.bottom > m.top + 1) issues.push("the timer overlaps the metrics");
    }
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
  for (const card of document.querySelectorAll('[data-slot="app-main"] [data-slot="card"]')) {
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
  // The training drills learned cases only.
  await act(page, "learn:F2L 1");

  await act(page, "nav:training");
  await page.waitForSelector('[data-action^="trainSet:"]');
  await check("training-setup");
  await act(page, "trainSet:f2l");
  await act(page, "trainingStart:cases:practice");
  await page.waitForSelector('[data-action="solution"]');
  await check("training");
  await act(page, "trainingSetup");
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
