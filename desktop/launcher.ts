delete process.env.ELECTRON_RUN_AS_NODE;
/** Compiled with bun build --compile. No Bun installation or administrator rights required. */
import { mkdir, readFile, rm, writeFile, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { electronLaunchOptions } from "./platform";
import {
  currentRelease,
  installUpdate,
  rollback,
  pruneReleases,
} from "./updater";
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
  const launch = async (id: string) => {
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
  // Keep the main application closed until the newest signed release is ready.
  const splash = Bun.spawn([executable(current.id), ...platform.args, join(base, "splash.cjs")], {
    env: { ...platform.env, CUBIX_SPLASH_DATA: join(base, "splash-profile") },
    stdin: "pipe", stdout: "ignore", stderr: "ignore",
  });
  const progress = (message: string) => {
    try { splash.stdin.write(JSON.stringify({ message }) + "\n"); } catch { /* Splash may have been closed. */ }
  };
  const updateLock = join(base, "update.lock");
  let updating = false;
  let selected = current;
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
        }) ?? current;
        await rm(join(base, "update-error.log"), { force: true });
      } catch (error) {
        await writeFile(join(base, "update-error.log"), new Date().toISOString() + " " + String(error) + "\n");
        selected = await currentRelease(base) ?? current;
      }
    }
    progress("Ouverture de Cubix…");
    let healthyId = selected.id;
    let child = await launch(healthyId);
    if (!child) {
      progress("Restauration de la version précédente…");
      const previous = await rollback(base, selected.id);
      if (previous) {
        healthyId = previous.id;
        child = await launch(healthyId);
      }
    }
    if (!child) throw Error("Cubix could not start. See application.log.");
    if (updating) await pruneReleases(base, healthyId);
  } finally {
    splash.stdin.end();
    await splash.exited;
    if (updating) await rm(updateLock, { force: true });
  }
} finally {
  if (acquired) await rm(lock, { force: true });
}
// Electron owns the app lifetime after startup has completed.
process.exit(0);
