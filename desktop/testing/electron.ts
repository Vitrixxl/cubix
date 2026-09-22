delete process.env.ELECTRON_RUN_AS_NODE;
import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const dir = await mkdtemp(join(tmpdir(), "cubix-electron-ui-"));
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
    CUBIX_DESKTOP_DATA: dir,
    CUBIX_API_ORIGIN: "http://127.0.0.1:47139",
  },
  timeout: 30000,
});
try {
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error(m.text());
  });
  await page.waitForSelector(".timer");
  await page.waitForFunction(
    () =>
      !!document.querySelector(".scramble")?.textContent &&
      !document.querySelector(".scramble")?.textContent?.includes("Generating"),
  );
  await page.waitForTimeout(3500);
  await mkdir("artifacts/electron/testing", { recursive: true });
  await page.screenshot({ path: "artifacts/electron/testing/timer.png" });
  for (const [action, name] of [
    ["nav:algorithms", "catalog"],
    ["case:F2L 1", "detail"],
    ["nav:training", "training"],
    ["selectSet:f2l", "training-selected"],
    ["nav:profile", "account"],
  ] as const) {
    await page.locator(`[data-action="${action}"]`).first().click();
    await page.waitForSelector("[data-exiting]", { state: "detached" });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `artifacts/electron/testing/${name}.png` });
    if (name === "catalog")
      await Bun.write(
        "artifacts/electron/testing/layout.json",
        JSON.stringify(
          await page
            .locator(
              ".stage-title,.catalog-stage,.catalog-scroll,.catalog-grid,.catalog-tile",
            )
            .evaluateAll((es) =>
              es
                .slice(0, 10)
                .map((e) => ({
                  class: e.className,
                  rect: e.getBoundingClientRect().toJSON(),
                  style: getComputedStyle(e).display,
                  justify: getComputedStyle(e).justifyContent,
                })),
            ),
          null,
          2,
        ),
      );
  }
  if (errors.length) throw Error(errors.join("\n"));
  console.log("Electron screens loaded successfully");
} finally {
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
