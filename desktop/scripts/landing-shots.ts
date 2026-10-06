/**
 * The landing page's screenshots and social image (desktop/assets/landing), taken headless from a development server signed in as the
 * seeded `dev` account: the timer after a few typed times, the algorithms, a course step and the profile.
 *
 *   bun desktop/scripts/landing-shots.ts [origin]   (default http://127.0.0.1:5181, see `bun run dev:docker`)
 */
import { chromium, type Page } from "playwright";
import { resolve } from "node:path";
import sharp from "sharp";

const origin = process.argv[2] ?? "http://127.0.0.1:5181";
const out = resolve(import.meta.dir, "../assets/landing");
const browser = await chromium.launch({ headless: true });
// Twice as sharp as they are shown: a screen of any density draws them crisp.
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
const save = async (name: string) => {
  // Development tools (the virtual smart cube's button) are not in the app people install.
  await page.addStyleTag({ content: '[data-action="smartCube"]{display:none!important}' });
  await page.mouse.move(1279, 799);
  await page.waitForTimeout(800);
  await sharp(await page.screenshot()).webp({ quality: 92 }).toFile(`${out}/${name}.webp`);
  console.log(`${name}.webp`);
};
const go = async (path: string, ready: (page: Page) => Promise<unknown>) => {
  await page.goto(origin + path);
  await ready(page);
};

await page.goto(origin + "/timer");
await page.waitForSelector(".login, .rail", { timeout: 60000 });
if (await page.locator(".login").count()) {
  await page.locator('[data-action="login:mode:login"]').click().catch(() => {});
  await page.fill("#login-username", "dev");
  await page.fill("#login-password", "cubix-dev-password");
  await page.locator('[data-action="login:submit"]').click();
}
await page.locator(".rail").waitFor({ timeout: 60000 });
// A session with times: typed in, as from another timer, then the timer itself again.
await go("/timer?puzzle=333", (p) => p.locator(".scramble .alg").first().waitFor());
const entry = async (name: RegExp) => {
  await page.locator('[data-action="menu:entry"]').click();
  await page.getByRole("menuitemradio", { name }).click();
};
await entry(/Typing/);
const count = () => page.locator('aside[aria-label="Session times"]').evaluate((aside) => Number(/\d+/.exec(aside.textContent ?? "")?.[0] ?? 0));
for (const time of ["1184", "1047", "1312", "998", "1121", "1076", "1235", "1009", "1142", "1063", "1190", "1028"]) {
  // One at a time: the next is typed once the one before is saved.
  const before = await count(), field = page.getByLabel("Time", { exact: true });
  // Enter is ignored while a scramble is being drawn: typed again until the time is saved.
  for (let attempt = 0; (await count()) === before; attempt++) {
    if (attempt === 10) throw Error(`The time ${time} was not saved.`);
    await field.fill(time);
    await field.press("Enter");
    await page.waitForTimeout(800);
  }
}
await entry(/^Timer/);
await page.waitForTimeout(800);
await save("timer");
await go("/algorithms?puzzle=333", (p) => p.waitForTimeout(1500));
await save("algorithms");
await go("/learn/cfop?puzzle=333&step=1", (p) => p.waitForTimeout(2000));
await save("learn");
await go("/profile?puzzle=333", (p) => p.waitForTimeout(2500));
await save("profile");
// The social image: the timer, as large as link previews draw it.
await sharp(`${out}/timer.webp`).resize(1200, 630, { fit: "cover", position: "top" }).png({ compressionLevel: 9 }).toFile(`${out}/og.png`);
console.log("og.png");
await browser.close();
