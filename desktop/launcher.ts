delete process.env.ELECTRON_RUN_AS_NODE;
/** Compiled with bun build --compile. No Bun installation or administrator rights required. */
import { mkdir, readFile, rm, writeFile, open } from "node:fs/promises";
import { dirname, join } from "node:path";
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
  const platformArgs =
    process.platform === "linux" && !process.env.WAYLAND_DISPLAY
      ? ["--ozone-platform=x11"]
      : [];
  const startedAt = performance.now();
  const launch = async (id: string) => {
    const ready = join(base, `ready-${process.pid}`);
    await rm(ready, { force: true });
    const child = Bun.spawn(
      [executable(id), ...platformArgs, join(base, "releases", id, "app")],
      {
        env: {
          ...process.env,
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
  let healthyId = current.id;
  let child = await launch(healthyId);
  if (!child) {
    const previous = await rollback(base, current.id);
    if (previous) {
      healthyId = previous.id;
      child = await launch(healthyId);
    }
  }
  if (!child) throw Error("Cubix could not start. See application.log.");
  // Release the startup lock before network work so closing and reopening the
  // app also stays fast while a download is in progress. Only one updater may
  // install or prune releases at a time.
  const updateLock = join(base, "update.lock");
  const updating = child.exitCode === null && await acquireLock(updateLock);
  try {
    await rm(lock, { force: true });
    acquired = false;
    if (updating) {
      try {
        await pruneReleases(base, healthyId);
        // The verified update will be used on the next launch.
        await installUpdate({
          base,
          origin: process.env.CUBIX_API_ORIGIN ?? config.origin,
          publicKey: config.publicKey,
          target: config.target,
        });
      } catch (e) {
        await writeFile(
          join(base, "update-error.log"),
          new Date().toISOString() + " " + String(e) + "\n",
        );
      }
    }
  } finally {
    if (updating) await rm(updateLock, { force: true });
  }
} finally {
  if (acquired) await rm(lock, { force: true });
}
// Electron owns the app lifetime; the updater exits once its work is complete.
process.exit(0);
