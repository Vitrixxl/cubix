/** Deterministic GPUI / Electron reference captures. Requires a GPUI reference build and X11. */
import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
delete process.env.ELECTRON_RUN_AS_NODE;
const x = process.env.CUBIX_XDOTOOL ?? "xdotool",
  magick = process.env.CUBIX_MAGICK ?? "magick",
  out = resolve("artifacts/electron/comparison");
await mkdir(out, { recursive: true });
const run = async (args: string[]) => {
  const p = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  const text = await new Response(p.stdout).text();
  if (await p.exited) throw Error(await new Response(p.stderr).text());
  return text.trim();
};
const scramble = "R U R' U' F2 D L2 B U2 R2 F' D2";
const fixture = {
  "cubix.playground.scrambleByContext": JSON.stringify({
    "333:standard:normal": scramble,
  }),
  "cubix.training.selectionByCube": JSON.stringify({ "333": ["F2L 1"] }),
  "cubix.training.randomAuf": "false",
};
const results: any[] = [];
for (const [w, h, label] of [
  [1280, 800, "desktop"],
  [390, 844, "compact"],
] as const) {
  const dir = await mkdtemp(join(tmpdir(), "cubix-compare-"));
  await writeFile(join(dir, "storage.json"), JSON.stringify(fixture));
  const native = Bun.spawn([resolve("desktop/target/debug/cubix-desktop")], {
    env: {
      ...process.env,
      CUBIX_WIDTH: String(w),
      CUBIX_HEIGHT: String(h),
      CUBIX_API_ORIGIN: "http://127.0.0.1:47139",
      CUBIX_DESKTOP_DATA: dir,
      CUBIX_REFERENCE_CONTROL: dir,
    },
    stdout: "ignore",
    stderr: "inherit",
  });
  const electronDir = join(dir, "electron");
  await mkdir(electronDir);
  await writeFile(join(electronDir, "storage.json"), JSON.stringify(fixture));
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    for (
      let i = 0;
      i < 200 && !(await Bun.file(join(dir, "state.json")).exists());
      i++
    )
      await Bun.sleep(50);
    const win = (await run([x, "search", "--pid", String(native.pid)]))
      .split("\n")
      .at(-1)!;
    await run([x, "windowsize", win, String(w), String(h)]);
    app = await electron.launch({
      executablePath: resolve("node_modules/electron/dist/electron"),
      args: [
        `--ozone-platform=${process.env.CUBIX_OZONE_PLATFORM ?? "x11"}`,
        resolve("desktop/dist"),
        `--user-data-dir=${join(dir, "chromium")}`,
      ],
      env: {
        ...process.env,
        CUBIX_BUN: process.execPath,
        CUBIX_WIDTH: String(w),
        CUBIX_HEIGHT: String(h),
        CUBIX_DESKTOP_DATA: electronDir,
        CUBIX_API_ORIGIN: "http://127.0.0.1:47139",
      },
    });
    const page = await app.firstWindow();
    await page.waitForSelector(".timer");
    const actions = [
      ["", "timer"],
      ["nav:algorithms", "catalog"],
      ["case:F2L 1", "detail"],
      ["nav:training", "training"],
      ["solution", "solution"],
      ["nav:profile", "account"],
      ["authMode:login", "login"],
      ["light:light", "light"],
      ["help", "guide"],
    ] as const;
    for (const [action, name] of actions) {
      if (action) {
        await writeFile(
          join(dir, "command.tmp"),
          JSON.stringify({
            actions: [action],
            ...(action === "help" ? { route: "overviewGuide" } : {}),
          }),
        );
        await rename(join(dir, "command.tmp"), join(dir, "command.json"));
        await page.locator(`[data-action="${action}"]`).first().click();
      }
      await Bun.sleep(
        name === "detail" ||
          name === "training" ||
          name === "timer" ||
          name === "guide"
          ? 3300
          : 300,
      );
      await run([x, "windowraise", win]);
      await Bun.sleep(200);
      const nativeState = await Bun.file(join(dir, "state.json")).json();
      const a = join(out, `${label}-${name}-gpui.png`),
        b = join(out, `${label}-${name}-electron.png`);
      await run([magick, "import", "-window", win, a]);
      await page.screenshot({ path: b });
      const compare = Bun.spawn(
        [
          magick,
          "compare",
          "-metric",
          "MAE",
          a,
          b,
          join(out, `${label}-${name}-diff.png`),
        ],
        { stdout: "ignore", stderr: "pipe" },
      );
      const metric = await new Response(compare.stderr).text();
      await compare.exited;
      results.push({
        viewport: label,
        screen: name,
        nativePage: nativeState.page,
        meanAbsoluteError: metric.trim(),
      });
      console.log(label, name, metric.trim());
    }
  } finally {
    if (app) {
      const closing = app.close();
      const timeout = setTimeout(() => app?.process().kill(), 5000);
      await closing.catch(() => {});
      clearTimeout(timeout);
    }
    native.kill();
    await native.exited;
    await rm(dir, { recursive: true, force: true });
  }
}
await Bun.write(join(out, "report.json"), JSON.stringify(results, null, 2));
