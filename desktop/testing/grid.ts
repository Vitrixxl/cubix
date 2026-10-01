/** The lines of the app form one grid: wherever two lines meet a third from either side, they continue each other
 * rather than missing by a few pixels. Walks every screen in headless Chromium against a disposable API serving the
 * web build, and lists each near miss with the elements drawing it.
 * Build first: `bun run build:api && bun desktop/web.ts`. `--shots` also saves a screenshot of each screen. */
import { chromium, type Page } from "playwright";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signIn, startServer } from "./app";

const SHOTS = "artifacts/grid";
const shots = process.argv.includes("--shots");
if (shots) await mkdir(SHOTS, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), "cubix-grid-"));
// Three sizes load the whole app again and again: above the per-address rate limit.
const { origin, server } = await startServer(join(dir, "server"), { CUBIX_RATE_LIMIT: "100000" });
const browser = await chromium.launch({ executablePath: process.env.CUBIX_TEST_CHROMIUM ?? "/usr/bin/chromium", headless: true });

/** Lines meeting a third one from its two sides, whose ends miss each other by more than a pixel. */
function nearMisses(): string[] {
  type H = { y: number; x1: number; x2: number; who: string };
  type V = { x: number; y1: number; y2: number; who: string };
  const hs: H[] = [], vs: V[] = [];
  const name = (e: Element) => e.tagName.toLowerCase() + [...e.classList].slice(0, 2).map((c) => "." + c).join("");
  const visible = (e: Element) => {
    for (let n: Element | null = e; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  // Under an open dialog (or a phone's sheet) only the dialog counts.
  const dialog = document.querySelector("[role=dialog]");
  for (const e of (dialog ?? document.body).querySelectorAll("*")) {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    if (e.closest('[data-exiting], [data-slot="tooltip-content"], [data-sonner-toaster], [data-slot$="-overlay"]')) continue;
    const s = getComputedStyle(e);
    const drawn = (side: string) => parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0 && s.getPropertyValue(`border-${side}-style`) !== "none" && !/rgba\(.*, 0\)|transparent/.test(s.getPropertyValue(`border-${side}-color`));
    const sides = ["top", "bottom", "left", "right"].filter(drawn);
    if (!sides.length || !visible(e)) continue;
    const who = name(e);
    if (sides.includes("top")) hs.push({ y: r.top, x1: r.left, x2: r.right, who });
    if (sides.includes("bottom")) hs.push({ y: r.bottom - 1, x1: r.left, x2: r.right, who });
    if (sides.includes("left")) vs.push({ x: r.left, y1: r.top, y2: r.bottom, who });
    if (sides.includes("right")) vs.push({ x: r.right - 1, y1: r.top, y2: r.bottom, who });
  }
  const found = new Set<string>();
  const report = (a: number, b: number, what: string) => found.add(`${Math.round(a)}→${Math.round(b)} ${what}`);
  // Horizontal lines ending on a vertical one from the left and starting from it on the right.
  for (const v of vs) {
    const left = hs.filter((h) => Math.abs(h.x2 - 1 - v.x) <= 1.5 && h.y > v.y1 + 1 && h.y < v.y2 - 1);
    const right = hs.filter((h) => Math.abs(h.x1 - v.x) <= 1.5 && h.y > v.y1 + 1 && h.y < v.y2 - 1);
    for (const l of left) {
      if (right.some((r) => Math.abs(r.y - l.y) < 0.5)) continue;
      const miss = right.find((r) => Math.abs(r.y - l.y) >= 0.5 && Math.abs(r.y - l.y) <= 24);
      if (miss) report(l.y, miss.y, `y: ${l.who} | ${miss.who} (at x ${Math.round(v.x)}, ${v.who})`);
    }
  }
  // Vertical lines ending on a horizontal one from above and starting from it below.
  for (const h of hs) {
    const above = vs.filter((v) => Math.abs(v.y2 - 1 - h.y) <= 1.5 && v.x > h.x1 + 1 && v.x < h.x2 - 1);
    const below = vs.filter((v) => Math.abs(v.y1 - h.y) <= 1.5 && v.x > h.x1 + 1 && v.x < h.x2 - 1);
    for (const a of above) {
      if (below.some((b) => Math.abs(b.x - a.x) < 0.5)) continue;
      const miss = below.find((b) => Math.abs(b.x - a.x) >= 0.5 && Math.abs(b.x - a.x) <= 24);
      if (miss) report(a.x, miss.x, `x: ${a.who} / ${miss.who} (at y ${Math.round(h.y)}, ${h.who})`);
    }
  }
  // Two lines side by side, a pixel apart, read as one line twice as thick.
  for (const [i, a] of hs.entries())
    for (const b of hs.slice(i + 1))
      if (Math.abs(a.y - b.y) >= 0.5 && Math.abs(a.y - b.y) <= 1.5 && Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > 8)
        report(a.y, b.y, `double: ${a.who} = ${b.who} (x ${Math.round(Math.max(a.x1, b.x1))}–${Math.round(Math.min(a.x2, b.x2))})`);
  for (const [i, a] of vs.entries())
    for (const b of vs.slice(i + 1))
      if (Math.abs(a.x - b.x) >= 0.5 && Math.abs(a.x - b.x) <= 1.5 && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > 8)
        report(a.x, b.x, `double: ${a.who} = ${b.who} (y ${Math.round(Math.max(a.y1, b.y1))}–${Math.round(Math.min(a.y2, b.y2))})`);
  return [...found];
}

const settle = (page: Page) => page.waitForSelector("[data-exiting]", { state: "detached" }).then(() => page.waitForTimeout(250));
/** Clicks the first visible control of an action; on phones a header's "…" menu is opened for it when needed. */
const act = async (page: Page, action: string) => {
  const target = page.locator(`[data-action="${action}"]:visible`);
  if (!(await target.count()) && (await page.locator('[data-action="menu:more"]:visible').count())) {
    await page.locator('[data-action="menu:more"]:visible').first().click();
    await page.waitForTimeout(250);
  }
  await target.first().click();
  await settle(page);
};
const results: [string, string[]][] = [];
async function check(page: Page, screen: string) {
  await settle(page);
  const size = page.viewportSize()!;
  const name = `${screen} ${size.width}×${size.height}`;
  results.push([name, await page.evaluate(nearMisses)]);
  if (shots) await page.screenshot({ path: `${SHOTS}/${screen}-${size.width}.png` });
}
async function solve(page: Page) {
  await page.waitForFunction(() => !!document.querySelector(".scramble .alg") && /release to start/.test(document.querySelector("[data-phase]")?.textContent ?? ""));
  await page.keyboard.down("Space");
  await page.waitForSelector('[data-phase="Ready"]');
  await page.keyboard.up("Space");
  await page.waitForSelector('[data-phase="Running"]');
  await page.waitForTimeout(120);
  await page.keyboard.press("a");
  await page.waitForSelector('[data-phase="Idle"]');
}

const sizes = process.argv.includes("--phone") ? [[390, 844]] : process.argv.includes("--desktop") ? [[2048, 1280], [1440, 900], [1280, 800]] : [[2048, 1280], [1440, 900], [1280, 800], [390, 844]];
try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width: width!, height: height! } });
    const page = await context.newPage();
    page.on("pageerror", (e) => console.log("page error:", e.message));
    await page.goto(origin);
    // Nothing without an account: the login page first, then a fresh account per size.
    await page.waitForSelector("#login-username");
    await settle(page);
    await check(page, "login");
    await page.locator('[data-action="login:mode:register"]').click();
    await page.fill("#login-username", "grid_" + width);
    await page.fill("#login-password", "short");
    await page.locator('[data-action="login:submit"]').click();
    await page.waitForSelector("[data-slot=field-error]");
    await check(page, "login-error");
    await signIn(page, "grid_" + width);
    await page.waitForSelector("[data-phase]");
    await page.waitForFunction(() => !!document.querySelector(".scramble .alg"), undefined, { timeout: 60000 });
    for (let i = 0; i < 6; i++) await solve(page);
    await check(page, "timer");
    await act(page, "nav:algorithms");
    await check(page, "algorithms");
    await page.locator("[data-action^='case:']").first().click();
    await check(page, "case");
    await act(page, "nav:training");
    await check(page, "training-setup");
    await act(page, "setupMode:cross1");
    await act(page, "trainingStart:cross1");
    await check(page, "cross-plus-one");
    await act(page, "nav:duel");
    await check(page, "duel-lobby");
    // A race: a second tab of the same browser is the opponent.
    const other = await context.newPage();
    await other.goto(origin);
    // Another account in the same browser would replace this one: the opponent tab signs in as the same player, the
    // server pairs the two tabs as different connections.
    await other.waitForSelector('[data-action="nav:duel"]', { timeout: 60000 });
    await other.locator('[data-action="nav:duel"]').first().click();
    await other.waitForSelector('[data-action="duel:search"]');
    await page.locator('[data-action="duel:search"]').click();
    await other.locator('[data-action="duel:search"]').click();
    await page.waitForSelector(".duel-scramble .alg");
    await check(page, "duel-race");
    await other.close();
    // The profile is the account row at the foot of the sidebar, the Account tab on phones.
    await act(page, "nav:profile");
    await check(page, "profile");
    for (const mode of ["playground", "training", "achievements", "duels"]) {
      // A section without data (no battles yet) has no link to open.
      if (!(await page.locator(`[data-action="profileMode:${mode}"]:visible`).count()) && !(await page.locator('[data-action="menu:more"]:visible').count())) continue;
      await act(page, "profileMode:" + mode);
      await check(page, "profile-" + mode);
      if (mode === "playground") {
        await act(page, "statsView:table");
        await check(page, "profile-table");
        await act(page, "statsView:chart");
      }
      // Phones switch the sections with a segmented control rather than opening them as pages.
      await act(page, "profileMode:overview");
    }
    await act(page, "settings");
    await check(page, "settings");
    // The guides are in the sidebar's foot, on phones in the account page's header.
    await page.keyboard.press("Escape");
    await settle(page);
    await act(page, "help");
    await check(page, "guides");
    await context.close();
  }
  let total = 0;
  for (const [name, misses] of results) {
    total += misses.length;
    console.log(`${misses.length ? "✗" : "✓"} ${name}${misses.map((m) => "\n    " + m).join("")}`);
  }
  console.log(total ? `${total} near misses` : "Every line meets its neighbours.");
  process.exitCode = total ? 1 : 0;
} finally {
  await browser.close();
  server.kill();
  await rm(dir, { recursive: true, force: true });
}
