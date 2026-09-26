/** Headless screenshots of the profile overview at common window sizes, with overflow checks. */
import { launchApp, startServer } from "./app";
import { mkdtemp, mkdir, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const dir = await mkdtemp(join(tmpdir(), "cubix-overview-"));
const data = process.env.CUBIX_PREVIEW_DATA;
if (data) await cp(join(data, "storage.json"), join(dir, "storage.json"));
const { origin, server } = await startServer(join(dir, "server"));
const app = await launchApp({ dir, origin });
try {
  const page = await app.firstWindow();
  page.on("pageerror", (error) => console.error("pageerror", error.message));
  await page.waitForSelector(".scramble .alg");
  await page.locator('[data-action="nav:profile"]').first().click();
  await page.waitForSelector(".overview");
  await mkdir("artifacts/electron/testing", { recursive: true });
  for (const [w, h] of [[800, 600], [1024, 640], [1280, 800], [1600, 900], [2048, 1280]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForFunction(([a, b]) => innerWidth === a && innerHeight === b, [w, h]);
    await page.waitForTimeout(400);
    const report = await page.evaluate(() => {
      const el = document.querySelector(".overview")!, r = el.getBoundingClientRect();
      const out = [] as string[];
      if (el.scrollHeight > el.clientHeight + 1) out.push(`overview scrolls by ${el.scrollHeight - el.clientHeight}px`);
      for (const sel of [".ov-band-timer", ".ov-ring-card", ".ov-chip", ".ov-hero-figure", ".ov-bests"]) {
        for (const e of document.querySelectorAll(sel)) {
          const b = e.getBoundingClientRect();
          if (!b.width && !b.height) continue;
          if (b.right > r.right + 1 || b.left < r.left - 1) out.push(`${sel} outside horizontally`);
          if (e.scrollWidth > e.clientWidth + 1) out.push(`${sel} clipped horizontally`);
        }
      }
      if (document.documentElement.scrollHeight > innerHeight) out.push("page overflows");
      return out;
    });
    const file = `artifacts/electron/testing/overview-${w}x${h}.png`;
    await page.screenshot({ path: file });
    console.log(file, report.length ? report.join("; ") : "ok");
  }
} finally {
  await app.close();
  server.kill();
}
