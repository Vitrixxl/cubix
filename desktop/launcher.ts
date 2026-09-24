delete process.env.ELECTRON_RUN_AS_NODE;
/** Compiled with bun build --compile. No Bun installation or administrator rights required. */
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { mkdir, readFile, rm, writeFile, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { electronLaunchOptions } from "./platform";
import {
  currentRelease,
  installUpdate,
  isOfflineError,
  rollback,
  pruneReleases,
} from "./updater";
import type { StartupNotice } from "./launcher-state";
const base = dirname(process.execPath),
  config = JSON.parse(await readFile(join(base, "launcher.json"), "utf8"));
await mkdir(base, { recursive: true });
const lock = join(base, "launcher.lock");
async function acquireLock(path: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = await open(path, "wx", 0o600);
      await fd.writeFile(String(process.pid));
      await fd.close();
      return true;
    } catch (error: any) {
      if (error.code !== "EEXIST") throw error;
      const pid = Number(await readFile(path, "utf8").catch(() => ""));
      try {
        if (!pid) return false; // Another launcher may still be writing its PID.
        process.kill(pid, 0);
        return false;
      } catch (error: any) {
        if (error.code !== "ESRCH") throw error;
        await rm(path, { force: true });
      }
    }
  }
  return false;
}
let acquired = await acquireLock(lock);
if (!acquired) process.exit(0);
try {
  const current = await currentRelease(base);
  if (!current)
    throw Error(
      "Cubix is not installed completely. Reinstall the application.",
    );
  const executable = (id: string) =>
    join(
      base,
      "releases",
      id,
      process.platform === "win32"
        ? "runtime/electron.exe"
        : process.platform === "darwin"
          ? "runtime/Electron.app/Contents/MacOS/Electron"
          : "runtime/electron",
    );
  const platform = await electronLaunchOptions();
  const startedAt = performance.now();
  const launch = async (id: string, notice: StartupNotice | null) => {
    const ready = join(base, `ready-${process.pid}`);
    await rm(ready, { force: true });
    const child = Bun.spawn(
      [executable(id), ...platform.args, join(base, "releases", id, "app")],
      {
        env: {
          ...platform.env,
          CUBIX_LAUNCH_READY: ready,
          CUBIX_LAUNCHER_PATH: process.execPath,
          CUBIX_RELEASE_ID: id,
          // The application tells the cuber why it opened without updating.
          ...(notice ? { CUBIX_STARTUP_NOTICE: notice } : {}),
        },
        stdout: "ignore",
        stderr: Bun.file(join(base, "application.log")),
      },
    );
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && child.exitCode === null) {
      if (await Bun.file(ready).exists()) {
        await rm(ready, { force: true });
        await writeFile(
          join(base, "last-launch.json"),
          JSON.stringify({
            id,
            ready: true,
            pid: child.pid,
            startupMs: Math.round(performance.now() - startedAt),
            at: new Date().toISOString(),
          }),
        );
        return child;
      }
      await Bun.sleep(100);
    }
    if (child.exitCode === 0) return child;
    child.kill();
    await child.exited;
    return null;
  };
  // Keep the main application closed until the newest signed release is ready. The startup window
  // only appears when an update really has to be downloaded; it shows the shared cube animation and
  // reports on stdout when it is painted, when the cube stands and when the cuber closes it.
  let splash: ReturnType<typeof Bun.spawn> | undefined;
  const window = { closed: false, settled: false, cancelled: false };
  const openWindow = () => {
    if (splash) return;
    splash = Bun.spawn([executable(current.id), ...platform.args, join(base, "splash.cjs")], {
      env: { ...platform.env, CUBIX_SPLASH_DATA: join(base, "splash-profile") },
      stdin: "pipe", stdout: "pipe", stderr: Bun.file(join(base, "launcher.log")),
    });
    void splash.exited.then(() => { window.closed = true; });
    void (async () => {
      try {
        for await (const line of createInterface({ input: Readable.fromWeb(splash!.stdout as any) })) {
          if (line === "settled") window.settled = true;
          else if (line === "cancel") window.cancelled = true;
        }
      } catch { /* The window is gone. */ }
    })();
  };
  const progress = (message: string, phase: "checking" | "opening" = "checking") => {
    if (!splash || window.closed) return;
    try { (splash.stdin as any).write(JSON.stringify({ message, phase }) + "\n"); } catch { /* Splash may have been closed. */ }
  };
  /** Let the cube finish standing before the application takes over; a window that never
   * painted (no display, slow machine) must not hold the start for long. */
  const settled = async () => {
    if (!splash) return;
    const deadline = Date.now() + 8000;
    while (!window.settled && !window.cancelled && !window.closed && Date.now() < deadline) await Bun.sleep(50);
  };
  const updateLock = join(base, "update.lock");
  let updating = false;
  let selected = current;
  let notice: StartupNotice | null = null;
  try {
    // A previous launcher may still be finishing its background download.
    progress("Recherche de mises à jour…");
    const deadline = Date.now() + 180000;
    while (!(updating = await acquireLock(updateLock)) && Date.now() < deadline)
      await Bun.sleep(100);
    if (updating) {
      try {
        selected = await installUpdate({
          base,
          origin: process.env.CUBIX_API_ORIGIN ?? config.origin,
          publicKey: config.publicKey,
          target: config.target,
          onProgress: progress,
          onUpdate: openWindow,
        }) ?? current;
        await rm(join(base, "update-error.log"), { force: true });
      } catch (error) {
        await writeFile(join(base, "update-error.log"), new Date().toISOString() + " " + String(error) + "\n");
        // Without a connection the installed version simply opens; any other failure is reported too.
        notice = isOfflineError(error) ? "offline" : "update-failed";
        selected = await currentRelease(base) ?? current;
      }
    }
    progress(notice === "offline" ? "Hors ligne. Ouverture de Cubix…" : "Ouverture de Cubix…", "opening");
    await settled();
    if (!window.cancelled) {
      let healthyId = selected.id;
      let child = await launch(healthyId, notice);
      if (!child) {
        progress("Restauration de la version précédente…", "opening");
        const previous = await rollback(base, selected.id);
        if (previous) {
          healthyId = previous.id;
          child = await launch(healthyId, notice);
        }
      }
      if (!child) throw Error("Cubix could not start. See application.log.");
      if (updating) await pruneReleases(base, healthyId);
    }
  } finally {
    if (splash) {
      if (!window.closed) (splash.stdin as any).end();
      await splash.exited;
    }
    if (updating) await rm(updateLock, { force: true });
  }
} finally {
  if (acquired) await rm(lock, { force: true });
}
// Electron owns the app lifetime after startup has completed.
process.exit(0);
