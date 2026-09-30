/** Test harness: a disposable Rust API serving the web build (dist/web) and the Electron shell pointed at it,
 * without any window (Chromium's headless Ozone backend). Build first: `bun desktop/build.ts && bun desktop/web.ts`. */
import { _electron as electron, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
delete process.env.ELECTRON_RUN_AS_NODE;

export const SHOTS = "artifacts/electron/testing";

export async function startServer(dir: string, env: Record<string, string> = {}) {
  await mkdir(dir, { recursive: true });
  const reserve = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = reserve.port!;
  reserve.stop();
  const origin = `http://127.0.0.1:${port}`;
  const server = Bun.spawn([resolve("rust-api/target/release/cubix-api")], {
    env: { ...process.env, PORT: String(port), CUBIX_HOST: "127.0.0.1", CUBIX_DB: join(dir, "server.db"), CUBIX_WEB_DIR: resolve("dist/web"), CUBIX_EXIT_WITH_PARENT: "1", ...env },
    stdout: "ignore",
    stderr: "inherit",
  });
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(origin + "/api/health")).ok) return { origin, server }; } catch {}
    await Bun.sleep(50);
  }
  server.kill();
  throw Error("The test API did not start");
}

/** Opens the app on `origin` with its data in `dir`; page errors are collected in `errors`. */
export async function launchApp({ dir, origin, width = 1280, height = 800 }: { dir: string; origin: string; width?: number; height?: number }) {
  const app = await electron.launch({
    executablePath: process.env.CUBIX_TEST_ELECTRON ?? resolve("node_modules/electron/dist/electron"),
    args: [`--ozone-platform=${process.env.CUBIX_OZONE_PLATFORM ?? "headless"}`, resolve("desktop/dist")],
    env: { ...process.env, CUBIX_DESKTOP_DATA: dir, CUBIX_WEB_ORIGIN: origin },
    timeout: 30000,
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // A headless window has no size of its own: emulate the viewport.
  await resize(page, width, height);
  return { app, page, errors };
}

export async function resize(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
}

/** Clicks the first button with this data-action and waits for the page transition to end. */
export async function act(page: Page, action: string) {
  await page.locator(`[data-action="${action}"]`).first().click();
  await page.waitForSelector("[data-exiting]", { state: "detached" });
}

/** Waits for a scramble on the practice page. */
export const scrambled = (page: Page) =>
  page.waitForFunction(() => {
    const text = document.querySelector(".scramble")?.textContent;
    return !!text && !text.includes("Generating");
  }, undefined, { timeout: 60000 });

/** The "Solves" metric of the practice page: this launch's session only. */
export const solveCount = (page: Page, n: number) =>
  page.waitForFunction((n) => [...document.querySelectorAll(".metrics .metric")]
    .some((metric) => metric.querySelector(".label")?.textContent === "Solves" && metric.querySelector(".metric-value")?.textContent === String(n)), n);

/** Starts and stops the timer with the keyboard. */
export async function timeSolve(page: Page) {
  await page.keyboard.down("Space");
  await page.waitForSelector('.timer[data-phase="Ready"]');
  await page.keyboard.up("Space");
  await page.waitForSelector('.timer[data-phase="Running"]');
  await page.waitForTimeout(160);
  await page.keyboard.press("a");
  await page.waitForSelector('.timer[data-phase="Idle"]');
}

/** The app is used signed in: on its login page, creates the account `username` (or signs in when it exists). */
export async function signIn(page: Page, username: string, password = "a-long-test-password") {
  await page.waitForSelector(".login, .rail, .tabbar", { timeout: 60000 });
  if (!(await page.locator(".login").count())) return;
  await page.locator('[data-action="login:mode:register"]').click();
  await page.fill("#login-username", username);
  await page.fill("#login-password", password);
  await page.locator('[data-action="login:submit"]').click();
  const error = page.locator("[data-slot=field-error]");
  await Promise.race([page.waitForSelector(".rail, .tabbar", { timeout: 30000 }), error.waitFor({ timeout: 30000 })]);
  if (await page.locator(".login").count()) {
    // Taken: the account exists already, sign in to it.
    await page.locator('[data-action="login:mode:login"]').click();
    await page.fill("#login-password", password);
    await page.locator('[data-action="login:submit"]').click();
    await page.waitForSelector(".rail, .tabbar", { timeout: 30000 });
  }
}
