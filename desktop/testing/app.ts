/** Test harness: a disposable API serving the web build (dist/web, or $CUBIX_TEST_WEB_DIR) and headless Chromium
 * pointed at it, without any window. Build first: `bun desktop/web.ts`. */
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PUZZLES } from "../../src/shared/puzzles";

export const SHOTS = "artifacts/testing";

export async function startServer(dir: string, env: Record<string, string> = {}) {
  await mkdir(dir, { recursive: true });
  // An API already running, the Docker dev stack's (`bun run dev:docker`, http://127.0.0.1:5181): nothing to start.
  const external = process.env.CUBIX_TEST_ORIGIN;
  if (external) return { origin: external, server: { kill() {}, exited: Promise.resolve(0) } };
  const reserve = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = reserve.port!;
  reserve.stop();
  const origin = `http://127.0.0.1:${port}`;
  const server = Bun.spawn([resolve(process.env.CUBIX_API_BIN ?? "go-api/cubix-api")], {
    env: { ...process.env, PORT: String(port), CUBIX_HOST: "127.0.0.1", CUBIX_DB: join(dir, "server.db"), CUBIX_WEB_DIR: resolve(process.env.CUBIX_TEST_WEB_DIR ?? "dist/web"), CUBIX_EXIT_WITH_PARENT: "1", CUBIX_DEV_LOGIN: "1", ...env },
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

/**
 * Opens the app on `origin` in headless Chromium, its browser profile in `dir`: a second launch on the same `dir` finds
 * the first one's data and offline cache. `storage` is written to the engine's IndexedDB (idbStorage.ts) before the app
 * starts. Page errors are collected in `errors`.
 */
export async function launchApp({ dir, origin, width = 1280, height = 800, storage }: { dir: string; origin: string; width?: number; height?: number; storage?: Record<string, string> }) {
  const app = await chromium.launchPersistentContext(join(dir, "browser"), {
    executablePath: process.env.CUBIX_TEST_CHROMIUM ?? "/usr/bin/chromium",
    headless: true,
    viewport: { width, height },
    // The checks read English labels, whatever the machine's language; animations off, which software 3D draws on the CPU.
    locale: "en-US",
    reducedMotion: "reduce",
  });
  await keepDesktopApp(app);
  const page = app.pages()[0] ?? (await app.newPage());
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (storage) {
    // Any page of the origin reaches its IndexedDB; the health check loads nothing of the app.
    await page.goto(origin + "/api/health");
    await page.evaluate((values) => new Promise<void>((done, fail) => {
      const open = indexedDB.open("cubix", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("storage");
      open.onerror = () => fail(open.error);
      open.onsuccess = () => {
        const transaction = open.result.transaction("storage", "readwrite"), store = transaction.objectStore("storage");
        for (const [key, value] of Object.entries(values)) store.put(value, key);
        transaction.oncomplete = () => (open.result.close(), done());
        transaction.onerror = () => fail(transaction.error);
      };
    }), storage);
  }
  await page.goto(origin + "/timer");
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
  const target = page.locator(`[data-action="${action}"]:visible`);
  if (!(await target.count())) {
    // The account's actions wait in its menu, on the header's face.
    if (ACCOUNT_MENU.includes(action) && (await page.locator('[data-action="menu:account"]:visible').count())) {
      await page.locator('[data-action="menu:account"]:visible').first().click();
      await target.first().waitFor();
    } else if (NAV_KEYS[action]) {
      // A page of another section: its shortcut, as its tab only shows within its section.
      await page.keyboard.press("Alt+" + NAV_KEYS[action]);
      return;
    }
  }
  await (await target.count() ? target : page.locator(`[data-action="${action}"]`)).first().click();
}
/** The actions of the account menu (shell.tsx). */
const ACCOUNT_MENU = ["settings", "help", "notation", "importTimes", "devices", "logout", "nav:login"];
/** The pages' shortcuts (app.tsx). */
const NAV_KEYS: Record<string, string> = { "nav:playground": "1", "nav:learn": "2", "nav:training": "3", "nav:algorithms": "4", "nav:duel": "5", "nav:tournaments": "6", "nav:community": "7", "nav:coaching": "8", "nav:analysis": "9" };

/** Waits for a scramble on the practice page. */
export const scrambled = (page: Page) =>
  page.waitForFunction(() => {
    const text = document.querySelector(".scramble")?.textContent;
    return !!text && !text.includes("Generating");
  }, undefined, { timeout: 60000 });

/**
 * The solves of the practice page's session (this launch's only): the "Solves" figure of the statistics, or the count
 * beside the times list's heading (or the session's name) when the list stands beside the stage (the figure then leaves the statistics).
 */
export const solveCount = (page: Page, n: number) =>
  page.waitForFunction((n) => {
    const figure = [...document.querySelectorAll('[aria-label="Statistics"] > *')].find((f) => f.firstElementChild?.textContent === "Solves"),
      // The timer's session list is headed by its name, a field.
      heading = [...document.querySelectorAll("h2")].find((h) => h.textContent === "Times" || h.textContent === "Session") ?? document.querySelector('input[aria-label="Session name"]');
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

/** Signs in with the dialog's dev sign-in, the account `username` created if missing. A guest opens it first. */
export async function signIn(page: Page, username: string, onboarding = false) {
  await live(page);
  await page.waitForSelector(".login, .rail, .tabbar", { timeout: 60000 });
  if (!(await page.locator(".login").count())) {
    if (!(await page.evaluate(async () => ((await window.cubix.call("init")) as any).user?.isGuest))) return;
    await page.goto(new URL("/login", page.url()).href);
    await page.waitForSelector(".login", { timeout: 60000 });
  }
  await page.fill("#login-username", username);
  await page.locator('[data-action="login:dev"]').click();
  await page.locator(".login").waitFor({ state: "detached", timeout: 30000 });
  await page.waitForSelector(".rail, .tabbar, .journey-setup", { timeout: 30000 });
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

/**
 * A browser context that keeps the desktop app at every size: the web serves phones, tablets and small windows the
 * phone app (boot.ts), while these tests check the desktop app and its own phone layout.
 */
export async function desktopContext(browser: Browser, options?: BrowserContextOptions) {
  return keepDesktopApp(await browser.newContext({ locale: "en-US", reducedMotion: "reduce", ...options }));
}
async function keepDesktopApp(context: BrowserContext) {
  await context.addInitScript(() => localStorage.setItem("cubix.phoneApp", "off"));
  return context;
}
