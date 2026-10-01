/** The administration (/admin) in headless Chromium against a disposable API: a few accounts with solves, learned cases
 * and requests, an admin token generated with the release binary, then every view on a desktop (1440×900) and a phone
 * (390×844): the token screen, the overview, the users, one account and its delete dialog, the requests filtered, the
 * IPs and the server. Build first: `bun run build:api && bun desktop/web.ts`. Screenshots in artifacts/login-admin. */
import { chromium, type Page } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { signIn, startServer } from "./app";
import { createApiClient } from "../../src/client/api-client";

const SHOTS = "artifacts/login-admin";
await mkdir(SHOTS, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), "cubix-admin-"));
const db = join(dir, "server", "server.db");
const { origin, server } = await startServer(join(dir, "server"), { CUBIX_RATE_LIMIT: "100000" });
const browser = await chromium.launch({ executablePath: process.env.CUBIX_TEST_CHROMIUM ?? "/usr/bin/chromium", headless: true });
const failures: string[] = [];
const check = (ok: unknown, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "✓" : "✗"} ${what}`);
};

/** Accounts using the app: solves over a few events, learned cases, a guest, a failed sign-in and a missing page. */
async function seed() {
  const PASSWORD = "a-long-test-password";
  const cases = ["F2L 1", "F2L 2", "F2L 3", "F2L 4", "F2L 5"];
  const names = ["alice", "bob_cubes", "carol", "dave_delete", "erin_speed"];
  for (const [i, name] of names.entries()) {
    const auth = await createApiClient(origin, { getToken: () => null }).register(name, PASSWORD);
    const api = createApiClient(origin, { getToken: () => auth.token });
    const events: [string, string][] = [["333", "standard"], ["222", "standard"], ["333", "one-handed"]];
    for (let n = 0; n < 6 + i * 7; n++) {
      const [puzzle, solveMode] = events[n % (i + 1) % events.length]!;
      await api.addSolve({ puzzle: puzzle as any, solveMode: solveMode as any, scrambleType: "normal", timeMs: 7000 + Math.round(Math.random() * 9000), penalty: n % 11 === 5 ? "dnf" : n % 7 === 3 ? "+2" : "none" });
    }
    for (const caseId of cases.slice(0, i + 1)) await api.setLearned(caseId, true);
    await api.me();
  }
  await fetch(origin + "/api/auth/guest", { method: "POST" });
  await fetch(origin + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "alice", password: "wrong-password-here" }) });
  await fetch(origin + "/api/does-not-exist");
  await fetch(origin + "/missing-page");
}

function adminToken() {
  const result = spawnSync(resolve("rust-api/target/release/cubix-api"), ["admin-token"], { env: { ...process.env, CUBIX_DB: db, CUBIX_ADMIN_PASSWORD: "" }, encoding: "utf8" });
  if (result.status !== 0) throw Error("admin-token failed: " + result.stderr);
  return result.stdout.split("\n")[0]!.trim();
}

const settle = (page: Page, ms = 400) => page.waitForLoadState("networkidle").catch(() => {}).then(() => page.waitForTimeout(ms));
/** Waits until no skeleton is left in the view. */
const loaded = (page: Page) => page.waitForFunction(() => !document.querySelector("[data-admin-scroll] [aria-busy=true]"), undefined, { timeout: 15000 });
async function shot(page: Page, name: string, scrolled = false) {
  const original = page.viewportSize()!;
  const sizes = original.width === 1440 ? [[1440, 900], [1280, 800], [2048, 1280]] : [[original.width, original.height]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width: width!, height: height! });
    await page.waitForTimeout(100);
    const errors = await page.evaluate(() => {
      const errors: string[] = [];
      if (document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1) errors.push("page overflow");
      for (const h of document.querySelectorAll("header h1")) {
        const sub = h.parentElement?.querySelector("p");
        if (!sub) continue;
        const a = h.getBoundingClientRect(), b = sub.getBoundingClientRect();
        if (a.width && b.width && (b.top >= a.bottom || b.left < a.right - 1)) errors.push("subtitle wraps: " + h.textContent);
      }
      return errors;
    });
    check(!errors.length, `${name} ${width}: header and viewport${errors.length ? " · " + errors.join(", ") : ""}`);
    await page.screenshot({ path: `${SHOTS}/${name}${width === original.width ? "" : "-" + width}.png` });
  }
  await page.setViewportSize(original);
  if (scrolled) {
    await page.evaluate(() => document.querySelector("[data-admin-scroll]")?.scrollTo({ top: 1e6 }));
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/${name}-end.png` });
    await page.evaluate(() => document.querySelector("[data-admin-scroll]")?.scrollTo({ top: 0 }));
  }
}
const nav = async (page: Page, phone: boolean, view: string) => {
  if (phone) {
    await page.locator('[data-action="admin:menu"]').click();
    await page.waitForTimeout(350);
  }
  await page.locator(`[data-action="admin:nav:${view}"]:visible`).first().click();
  await loaded(page);
  await settle(page);
};

/** The app's side: the login page on a desktop and a phone; a session the administration ends brings the login page
 * back at once with a message and the username; signing in again reopens the app; signing out returns to it. */
async function appSession(token: string) {
  for (const [width, height, tag] of [[390, 844, "phone"], [1440, 900, "desktop"]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: tag === "phone" ? 2 : 1 });
    const page = await context.newPage();
    await page.goto(origin);
    await page.waitForSelector(".login");
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/login-${tag}.png` });
    await page.locator('[data-action="login:mode:register"]').click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/login-register-${tag}.png` });
    if (tag === "phone") {
      await context.close();
      continue;
    }
    await signIn(page, "expiry_user");
    await page.waitForSelector(".timer");
    const login = await fetch(origin + "/api/admin/login", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ token }) });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const found = await (await fetch(origin + "/api/admin/users?q=expiry_user", { headers: { cookie } })).json();
    const id = found.rows[0].id;
    await fetch(origin + `/api/admin/users/${id}/revoke`, { method: "POST", headers: { cookie, origin } });
    // The server tells the app's live socket at once: its next sync is refused.
    await page.waitForSelector("[data-slot=login-expired]", { timeout: 20000 });
    check(true, "app: a revoked session returns to the login page with a message");
    check((await page.inputValue("#login-username")) === "expiry_user", "app: the ended session keeps the username");
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/login-expired-desktop.png` });
    await page.fill("#login-password", "a-long-test-password");
    await page.locator('[data-action="login:submit"]').click();
    await page.waitForSelector(".timer");
    check((await page.locator(".rail").count()) === 1, "app: signing in again reopens the app");
    await page.locator('[data-action="menu:account"]').click();
    await page.locator('[data-action="logout"]').click();
    await page.waitForSelector(".login");
    check(!(await page.locator("[data-slot=login-expired]").count()), "app: signing out returns to the login page");
    await context.close();
  }
}

try {
  const token = (await seed(), adminToken());
  for (const [width, height, phone] of [
    [1440, 900, false],
    [390, 844, true],
  ] as const) {
    const tag = phone ? "phone" : "desktop";
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: phone ? 2 : 1 });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
    await page.goto(origin + "/admin");
    await page.waitForSelector("[data-slot=admin-login]");
    await settle(page);
    await shot(page, `admin-token-${tag}`);
    // A wrong token is refused inline.
    await page.fill("#admin-token", "cbx_admin_" + "0".repeat(64));
    await page.locator('[data-action="admin:login"]').click();
    await page.waitForSelector("[data-slot=field-error]");
    check(/wrong|replaced/i.test(await page.locator("[data-slot=field-error]").innerText()), `${tag}: a wrong token is refused`);
    if (!phone) await shot(page, `admin-token-error-${tag}`);
    await page.fill("#admin-token", token);
    await page.locator('[data-action="admin:login"]').click();
    await page.waitForSelector("[data-admin-scroll]");
    await loaded(page);
    await page.waitForSelector("[data-slot=live][data-connected]", { timeout: 10000 });
    await settle(page, 700);
    check(!(await page.evaluate(() => performance.getEntriesByType("resource").some((r) => /\/build\/(worker|app)-/.test(r.name)))), `${tag}: /admin loads neither the app nor its engine`);
    check(await page.locator("figure[data-chart-title]").count() === 4, `${tag}: overview draws four charts`);
    await shot(page, `admin-overview-${tag}`, true);

    await nav(page, phone, "users");
    check((await page.locator(phone ? "[data-slot=users-list] li" : "[data-slot=users-table] tbody tr").count()) >= (phone ? 5 : 6), `${tag}: users lists every account`);
    await shot(page, `admin-users-${tag}`);
    if (!phone) {
      await page.locator('[data-action="sort:solves"]').click();
      await loaded(page);
      await settle(page);
      check((await page.locator("[data-slot=users-table] tbody tr").first().getAttribute("data-user")) === "erin_speed", `${tag}: sorting by solves puts the busiest account first`);
      await page.locator('[data-action="users:filter:guests"]').click();
      await settle(page);
      check((await page.locator("[data-slot=users-table] tbody tr").count()) === 1, `${tag}: the guests filter keeps the guest only`);
      await page.locator('[data-action="users:filter:all"]').click();
      await settle(page);
    }
    await page.locator(phone ? "[data-slot=users-list] button" : "[data-slot=users-table] tbody tr", { hasText: phone ? "carol" : "dave_delete" }).first().click();
    await page.waitForSelector("[data-slot=user-detail]");
    await settle(page, 600);
    await shot(page, `admin-user-${tag}`, true);
    await page.locator('[data-action="user:delete"]').click();
    await page.waitForSelector("[data-slot=alert-dialog-content]");
    check(await page.locator('[data-action="user:delete:submit"]').isDisabled(), `${tag}: delete waits for the username`);
    await page.fill("#delete-confirm", phone ? "carol" : "dave_delete");
    await page.waitForTimeout(250);
    await shot(page, `admin-delete-${tag}`);
    if (!phone) {
      await page.locator('[data-action="user:delete:submit"]').click();
      await page.waitForFunction(() => location.pathname === "/admin/users");
      await loaded(page);
      await settle(page);
      check(!(await page.locator("[data-slot=users-table] tbody tr", { hasText: "dave_delete" }).count()), `${tag}: the deleted account is gone`);
    } else {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }

    await nav(page, phone, "requests");
    await shot(page, `admin-requests-${tag}`);
    await page.locator('[data-action="requests:status"]').click();
    await page.getByRole("option", { name: "4xx", exact: true }).click();
    await loaded(page);
    await settle(page);
    const statuses = await page.locator(phone ? "[data-slot=requests-list] [data-slot=badge]" : "[data-slot=requests-table] [data-slot=badge]").allInnerTexts();
    check(statuses.length > 0 && statuses.every((s) => s.startsWith("4")), `${tag}: the 4xx filter keeps client errors only`);
    await shot(page, `admin-requests-4xx-${tag}`);

    await nav(page, phone, "ips");
    await shot(page, `admin-ips-${tag}`);
    await page.locator(phone ? "[data-slot=ips-list] button" : "[data-slot=ips-table] tbody tr").first().click();
    await page.waitForFunction(() => location.pathname === "/admin/requests" && location.search.includes("ip="));
    await loaded(page);
    await settle(page);
    check((await page.locator(phone ? "[data-slot=requests-list] li" : "[data-slot=requests-table] tbody tr").count()) > 0, `${tag}: an IP opens its requests`);
    if (!phone) await shot(page, `admin-requests-ip-${tag}`);

    await nav(page, phone, "server");
    await shot(page, `admin-server-${tag}`);
    if (phone) {
      await page.locator('[data-action="admin:menu"]').click();
      await page.waitForTimeout(400);
      await shot(page, `admin-nav-${tag}`);
      await page.keyboard.press("Escape");
    }
    check(!errors.length, `${tag}: no page error${errors.length ? ": " + errors.join(" | ") : ""}`);
    await context.close();
  }
  await appSession(token);
  console.log(failures.length ? `${failures.length} failed` : "Administration checked.");
  process.exitCode = failures.length ? 1 : 0;
} finally {
  await browser.close();
  server.kill();
  await rm(dir, { recursive: true, force: true });
}
