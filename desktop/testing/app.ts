/** Test harness: a disposable Rust API serving the web build (dist/web) and the Electron shell pointed at it,
 * without any window (Chromium's headless Ozone backend). Build first: `bun desktop/build.ts && bun desktop/web.ts`. */
import { _electron as electron, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PUZZLES } from "../../src/shared/puzzles";
delete process.env.ELECTRON_RUN_AS_NODE;

export const SHOTS = "artifacts/electron/testing";

export async function startServer(dir: string, env: Record<string, string> = {}) {
  await mkdir(dir, { recursive: true });
  // An API already running, the Docker dev stack's (`bun run dev:docker`, http://127.0.0.1:5181): nothing to start.
  const external = process.env.CUBIX_TEST_ORIGIN;
  if (external) return { origin: external, server: { kill() {}, exited: Promise.resolve(0) } };
  const reserve = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = reserve.port!;
  reserve.stop();
  const origin = `http://127.0.0.1:${port}`;
  const server = Bun.spawn([resolve(process.env.CUBIX_API_BIN ?? "rust-api/target/release/cubix-api")], {
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
  await live(page);
  return { app, page, errors };
}

/**
 * Waits for the app itself: a guest's page written ahead of time (desktop/prerender.tsx) stands in for it until the app
 * draws its own, and looks the same to a selector.
 */
export async function live(page: Page) {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForFunction(() => !!document.getElementById("root")?.childElementCount && !document.getElementById("prerendered"), undefined, { timeout: 60000 });
      return;
    } catch (error) {
      // The window was still opening its first page.
      if (attempt > 5 || !/destroyed|navigat/i.test(String(error))) throw error;
    }
  }
}

export async function resize(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
}

/** Clicks the first button with this data-action and waits for the page transition to end. */
export async function act(page: Page, action: string) {
  await page.locator(`[data-action="${action}"]`).first().click();
}

/** Waits for a scramble on the practice page. */
export const scrambled = (page: Page) =>
  page.waitForFunction(() => {
    const text = document.querySelector(".scramble")?.textContent;
    return !!text && !text.includes("Generating");
  }, undefined, { timeout: 60000 });

/**
 * The solves of the practice page's session (this launch's only): the "Solves" figure of the statistics, or the count
 * beside the times list's heading when the list stands beside the stage (the figure then leaves the statistics).
 */
export const solveCount = (page: Page, n: number) =>
  page.waitForFunction((n) => {
    const figure = [...document.querySelectorAll('[aria-label="Statistics"] > *')].find((f) => f.firstElementChild?.textContent === "Solves"),
      heading = [...document.querySelectorAll("h2")].find((h) => h.textContent === "Times" || h.textContent === "Session");
    return (figure?.lastElementChild ?? heading?.nextElementSibling)?.textContent === String(n);
  }, n);

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

/** Signs in: on the login page, creates the account `username` (or signs in when it exists). A guest goes there first. */
export async function signIn(page: Page, username: string, password = "a-long-test-password", onboarding = false) {
  await live(page);
  await page.waitForSelector(".login, .rail, .tabbar", { timeout: 60000 });
  if (!(await page.locator(".login").count())) {
    if (!(await page.evaluate(async () => ((await window.cubix.call("init")) as any).user?.isGuest))) return;
    await page.goto(new URL("/login", page.url()).href);
    await page.waitForSelector(".login", { timeout: 60000 });
  }
  await page.locator('[data-action="login:mode:register"]').click();
  await page.fill("#login-username", username);
  await page.fill("#login-password", password);
  await page.locator('[data-action="login:submit"]').click();
  const error = page.locator("[data-slot=field-error]");
  await Promise.race([page.waitForSelector(".rail, .tabbar, .journey-setup", { timeout: 30000 }), error.waitFor({ timeout: 30000 })]);
  if (await page.locator(".login").count()) {
    // Taken: the account exists already, sign in to it.
    await page.locator('[data-action="login:mode:login"]').click();
    await page.fill("#login-password", password);
    await page.locator('[data-action="login:submit"]').click();
    await page.waitForSelector(".rail, .tabbar, .journey-setup", { timeout: 30000 });
  }
  // Ordinary UI fixtures use an established profile that solves every puzzle, so none opens locked on its course;
  // onboarding and locking have their own full interaction test.
  if (!onboarding) {
    await page.evaluate(async (knownPuzzles) => {
      const initial = await window.cubix.call("init") as any;
      if (!initial.journey?.profile) await window.cubix.call("updateJourney", { profile: { kind: "profile", knownPuzzles, priority: null, completedAt: new Date().toISOString() } });
    }, PUZZLES.map(p => p.id));
    if (new URL(page.url()).pathname === "/onboarding") await page.goto(new URL("/timer", page.url()).href);
    await page.waitForSelector(".rail, .tabbar", { timeout: 30000 });
  }
}
