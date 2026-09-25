/** Real Electron input and a disposable Rust API: timer, persistence, accounts, training and responsive layout. */
import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
delete process.env.ELECTRON_RUN_AS_NODE;
const dir = await mkdtemp(join(tmpdir(), "cubix-flows-")),
  reserve = Bun.serve({ port: 0, fetch: () => new Response("") });
const port = reserve.port!;
reserve.stop();
const origin = `http://127.0.0.1:${port}`,
  server = Bun.spawn([resolve("rust-api/target/release/cubix-api")], {
    env: {
      ...process.env,
      PORT: String(port),
      CUBIX_HOST: "127.0.0.1",
      CUBIX_DB: join(dir, "server.db"),
      CUBIX_ADMIN_PASSWORD: "test-admin-password",
    },
    stdout: "ignore",
    stderr: "inherit",
  });
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(origin + "/api/health")).ok) break;
  } catch {}
  await Bun.sleep(50);
}
const app = await electron.launch({
  executablePath: resolve("node_modules/electron/dist/electron"),
  args: [
    `--ozone-platform=${process.env.CUBIX_OZONE_PLATFORM ?? "x11"}`,
    resolve("desktop/dist"),
    `--user-data-dir=${join(dir, "chromium")}`,
  ],
  env: {
    ...process.env,
    CUBIX_BUN: process.execPath,
    CUBIX_DESKTOP_DATA: join(dir, "data"),
    CUBIX_API_ORIGIN: origin,
  },
});
const errors: string[] = [];
app.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
try {
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  // A headless window starts at 1×1 and ignores window sizing: emulate the viewport instead.
  const headless = process.env.CUBIX_OZONE_PLATFORM === "headless";
  const resizeWindow = (width: number, height: number) =>
    headless
      ? page.setViewportSize({ width, height })
      : app.evaluate(
          ({ BrowserWindow }, { width, height }) =>
            BrowserWindow.getAllWindows()[0].setContentSize(width, height),
          { width, height },
        );
  if (headless) await resizeWindow(1280, 800);
  const act = async (a: string) => {
    await page.locator(`[data-action="${a}"]`).first().click();
    await page.waitForSelector("[data-exiting]", { state: "detached" });
  };
  const phase = async (p: string) =>
    page.waitForSelector(`[data-phase="${p}"]`);
  const count = async (n: number) =>
    page.waitForFunction(
      (n) =>
        document.querySelector(".practice-metrics .value")?.textContent ===
        String(n),
      n,
    );
  const shot = async (name: string) => {
    await page.screenshot({ path: `artifacts/electron/testing/${name}.png` });
  };
  await phase("Idle");
  await page.waitForFunction(
    () =>
      !!document.querySelector(".scramble")?.textContent &&
      !document.querySelector(".scramble")?.textContent?.includes("Generating"),
  );
  await page.keyboard.down("Space");
  await page.waitForTimeout(70);
  await page.keyboard.up("Space");
  await phase("Idle");
  await count(0);
  await page.keyboard.down("Space");
  await phase("Ready");
  await page.keyboard.up("Space");
  await phase("Running");
  await page.waitForTimeout(160);
  await page.keyboard.press("a");
  await phase("Idle");
  await count(1);
  console.log("Timer: early release, arm, start, stop, exactly one solve");
  await page.waitForSelector('.solve-actions [data-action$=":+2"]');
  await page.locator('.solve-actions [data-action$=":+2"]').click();
  await page.waitForSelector('.solve-actions [data-action$=":+2"].active');
  await page.locator('.solve-actions [data-action^="comment:"]').click();
  await page.locator("textarea").fill("Electron test note");
  await page.locator(".modal button[type=submit]").click();
  await page.waitForSelector(".modal", { state: "hidden" });
  await act("times");
  await page.locator(".time-row").first().click();
  assert(
    (await page.locator(".modal").textContent())?.includes(
      "Electron test note",
    ),
  );
  await act("close");
  await act("times");
  console.log("Solve: +2, comment and detail");
  await act("menu:entries");
  await page.getByRole("option", { name: "Typing", exact: true }).click();
  await page.getByRole("textbox", { name: "Time", exact: true }).fill("1234");
  await page.keyboard.press("Enter");
  await count(2);
  await act("menu:entries");
  await page.getByRole("option", { name: "Casual", exact: true }).click();
  await page.keyboard.down("Space");
  await phase("Ready");
  await page.keyboard.up("Space");
  await phase("Running");
  await page.keyboard.press("b");
  await phase("Idle");
  await page.waitForTimeout(200);
  await count(2);
  console.log("Typing and casual entry");
  await act("menu:modes");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await count(0);
  await act("menu:modes");
  await page.getByRole("option", { name: "Standard", exact: true }).click();
  await count(2);
  await act("nav:algorithms");
  await act("case:F2L 1");
  await page.keyboard.press("ArrowRight");
  assert((await page.locator("h1").textContent()) === "F2L 2");
  await page.keyboard.press("Alt+ArrowLeft");
  await page.waitForSelector(".catalog-page");
  await page.keyboard.press("Control+k");
  await page.locator(".search-modal input").fill("pll t");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".detail-page");
  assert((await page.locator("h1").textContent())?.includes("PLL"));
  await act("train");
  await page.waitForSelector(".case-title");
  await page.keyboard.down("Space");
  await phase("Ready");
  await page.keyboard.up("Space");
  await phase("Running");
  await page.keyboard.press("x");
  await count(1);
  await page.waitForSelector(".time-badge");
  await act("solution");
  await page.waitForSelector(".practice-alg:nth-of-type(3)");
  console.log("Catalogue, search, history, training solve and solution");
  await act("nav:profile");
  await page.waitForSelector(".stat-card");
  await shot("profile-guest");
  await act("account:register");
  await page.getByLabel("Username", { exact: true }).fill("electron_tester");
  await page
    .getByLabel("Password", { exact: true })
    .fill("electron-test-password");
  await page.locator("form button[type=submit]").click();
  await page.locator(".profile-header", { hasText: "electron_tester" }).waitFor();
  await page.waitForSelector(".stat-card");
  await shot("profile");
  await act("profileMode:playground");
  await page.waitForSelector(".chart");
  await shot("profile-timer");
  await act("back");
  await act("profileMode:training");
  await shot("profile-training");
  await act("profileCase:PLL T");
  await page.waitForSelector(".modal");
  await act("close");
  await act("back");
  await act("profileMode:achievements");
  await page.waitForSelector(".achievement-row");
  await shot("achievements");
  await act("achievementFilter:unlocked");
  assert((await page.locator(".achievement-row").count()) > 0);
  console.log(
    "Account registration imports guest solves, profile, achievements",
  );
  await act("settings");
  await page.waitForSelector(".settings-modal");
  for (const name of [
    "t3-code",
    "t3-chat",
    "grove",
    "ocean",
    "ember",
    "iris",
  ]) {
    await act("theme:" + name);
    for (const mode of ["light", "dark"]) {
      await act("light:" + mode);
      await shot(`settings-${name}-${mode}`);
    }
  }
  await act("help");
  for (const heading of [
    "About Cubix",
    "Using the algorithm library",
    "Using the algorithm trainer",
    "Using the cube timer",
    "Ao5 and Ao12: how cube timer averages work",
  ]) {
    if (heading !== "About Cubix") {
      const label = (
        {
          "Using the algorithm library": "Algorithm guide",
          "Using the algorithm trainer": "Training guide",
          "Using the cube timer": "Timer guide",
          "Ao5 and Ao12: how cube timer averages work": "Ao5 & Ao12",
        } as any
      )[heading];
      await page.getByRole("link", { name: label, exact: true }).last().click();
    }
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
  }
  console.log("Six themes, light/dark, five guides");
  await act("nav:playground");
  await act("menu:entries");
  await page.getByRole("option", { name: "Timer", exact: true }).click();
  for (const [width, height] of [
    [390, 844],
    [800, 600],
    [1280, 800],
    [1920, 1080],
    [2560, 1440],
  ]) {
    await resizeWindow(width, height);
    await page.waitForTimeout(150);
    for (const route of ["training", "playground"]) {
      await act("nav:" + route);
      const centers = await page.evaluate(() => {
        const middle = (selector: string) => {
          const rect = document
            .querySelector(selector)!
            .getBoundingClientRect();
          return rect.x + rect.width / 2;
        };
        return {
          width: innerWidth,
          above: middle(".practice-above"),
          timer: middle(".timer"),
          metrics: middle(".practice-metrics"),
        };
      });
      assert.equal(centers.width, width);
      for (const center of [centers.above, centers.timer, centers.metrics])
        assert(
          Math.abs(center - width / 2) < 1,
          `${route} must remain centered at ${width}px: ${JSON.stringify(centers)}`,
        );
    }
    await act("menu:modes");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    assert(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight === innerHeight &&
          document.documentElement.scrollWidth === innerWidth,
      ),
    );
    await shot(`responsive-${width}`);
    await act("nav:algorithms");
    assert(
      await page.evaluate(
        () => document.documentElement.scrollHeight === innerHeight,
      ),
    );
    await act("nav:playground");
  }
  console.log("Responsive layout and keyboard menus");
  const fixture = await page.evaluate(
    async () => (await window.cubix.call("init")).storage,
  );
  await Bun.write(
    "artifacts/electron/testing/account-storage.json",
    JSON.stringify(fixture),
  );
  assert.deepEqual(errors, []);
  await Bun.write(
    "artifacts/electron/testing/flows.json",
    JSON.stringify(
      {
        passed: true,
        checks: [
          "timer",
          "penalties",
          "comments",
          "typing",
          "casual",
          "contexts",
          "history",
          "search",
          "training",
          "account",
          "profile",
          "achievements",
          "themes",
          "guides",
          "responsive",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
  server.kill();
  await server.exited;
  await rm(dir, { recursive: true, force: true });
}
