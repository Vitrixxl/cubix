/** Real Electron layout checks at narrow and short desktop window sizes. */
import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
delete process.env.ELECTRON_RUN_AS_NODE;
const dir = await mkdtemp(join(tmpdir(), "cubix-responsive-"));
const app = await electron.launch({
  executablePath: resolve("node_modules/electron/dist/electron"),
  args: [`--ozone-platform=${process.env.CUBIX_OZONE_PLATFORM ?? "x11"}`, resolve("desktop/dist"), `--user-data-dir=${join(dir, "chromium")}`],
  env: { ...process.env, CUBIX_BUN: process.execPath, CUBIX_DESKTOP_DATA: dir, CUBIX_API_ORIGIN: "http://127.0.0.1:47139" },
});
try {
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const click = async (action: string) => {
    await page.locator(`[data-action="${action}"]`).first().click();
    await page.waitForSelector("[data-exiting]", { state: "detached" });
  };
  await page.waitForSelector(".scramble .alg");
  await mkdir("artifacts/electron/testing", { recursive: true });
  const resize = async (width: number, height: number) => {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
    await page.waitForTimeout(150);
  };
  const check = async (name: string) => {
    assert.equal(await page.locator(".sheet-backdrop").count(), 0, "practice is unobstructed");
    const problems = await page.evaluate(() => {
      const issues: string[] = [];
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const above = rect(".practice-above"), timer = rect(".timer"), below = rect(".practice-below"), toolbar = rect(".practice-toolbar"), nav = rect(".nav");
      if (above.top < 0 || above.bottom > timer.top + 1) issues.push("setup overlaps timer or window edge");
      if (timer.bottom > below.top + 1) issues.push("timer overlaps actions");
      if (below.bottom > toolbar.top + 1) issues.push("metrics overlap toolbar");
      if (toolbar.bottom > nav.top + 1) issues.push("toolbar overlaps navigation");
      for (const selector of [".practice-toolbar .button", ".solve-actions .button", ".practice-metrics .kpi", ".timer-digits", ".case-caption", ".practice-alg", ".practice-above canvas", ".notice"]) {
        for (const element of document.querySelectorAll(selector)) {
          const r = element.getBoundingClientRect();
          if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) issues.push(`${selector} outside viewport`);
          if (element.closest(".practice-above") && (r.top < above.top - 1 || r.bottom > above.bottom + 1)) issues.push(`${selector} outside setup area`);
        }
      }
      for (const element of document.querySelectorAll(".practice-alg > div:last-child, .scramble")) {
        const alg = element.querySelector(".alg");
        if (alg && element.clientHeight + 1 < Math.min(element.scrollHeight, parseFloat(getComputedStyle(alg).lineHeight))) issues.push("algorithm has less than one readable line");
      }
      if (document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth) issues.push("page overflows viewport");
      return issues;
    });
    assert.deepEqual(problems, [], name);
    await page.screenshot({ path: `artifacts/electron/testing/${name}.png` });
    console.log(name);
  };
  await resize(480, 540);
  await click("menu:entries");
  await page.getByRole("option", { name: "Typing", exact: true }).click();
  await page.getByRole("textbox", { name: "Time", exact: true }).fill("1234");
  await page.keyboard.press("Enter");
  await page.waitForSelector('[data-action^="penalty:"]');
  await click("menu:entries");
  await page.getByRole("option", { name: "Timer", exact: true }).click();
  await check("responsive-480x540-solved");
  for (const [w, h] of [[360, 540], [390, 844], [640, 480], [800, 600], [1024, 600], [1280, 800]]) {
    await resize(w, h);
    await check(`responsive-${w}x${h}`);
  }
  await click("nav:algorithms");
  await click("case:F2L 1");
  await click("train");
  await page.waitForSelector(".practice-alg .alg");
  await click("cases"); // collapse the desktop case rail before narrowing the window
  if (await page.locator(".rail.right").count()) await page.locator('.rail.right [data-action="times"]').click();
  await click("solution");
  for (const [w, h] of [[480, 540], [360, 540], [640, 480], [1280, 800]]) {
    await resize(w, h);
    await check(`responsive-training-${w}x${h}`);
  }
  await resize(640, 480);
  await page.keyboard.down("Space");
  await page.waitForSelector('.timer[data-phase="Ready"]');
  await page.keyboard.up("Space");
  await page.waitForSelector('.timer[data-phase="Running"]');
  await page.keyboard.press("a");
  await page.waitForSelector('[data-action^="penalty:"]');
  await page.waitForTimeout(400);
  await check("responsive-training-solved-640x480");
  await resize(360, 540);
  for (const action of ["nav:algorithms", "case:F2L 1", "nav:profile"]) {
    await click(action);
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => [...document.querySelectorAll(".page, .page > .scroll, .catalog-toolbar, .detail-actions")]
      .filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.className));
    await page.screenshot({ path: `artifacts/electron/testing/responsive-${action.replaceAll(":", "-")}.png` });
    assert.deepEqual(overflow, [], action);
  }
  assert.deepEqual(errors, []);
  console.log("Responsive Electron: timer, saved solve, actions, navigation and revealed training at 360–1280 px; no overlaps or page scrolling");
} finally {
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
