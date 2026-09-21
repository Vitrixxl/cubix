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
let acquired = false;
try {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = await open(lock, "wx", 0o600);
      await fd.writeFile(String(process.pid));
      await fd.close();
      acquired = true;
      break;
    } catch {
      const pid = Number(await readFile(lock, "utf8").catch(() => ""));
      try {
        if (!pid) throw Error();
        process.kill(pid, 0);
        process.exit(0);
      } catch {
        await rm(lock, { force: true });
      }
    }
  }
  if (!acquired) throw Error("Could not acquire launcher lock");
  let current = await currentRelease(base);
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
  const splash = Bun.spawn(
    [executable(current.id), ...platformArgs, join(base, "splash.cjs")],
    {
      stdin: "pipe",
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  const progress = (message: string) => {
    try {
      splash.stdin.write(JSON.stringify({ message }) + "\n");
    } catch {}
  };
  try {
    current =
      (await installUpdate({
        base,
        origin: process.env.CUBIX_API_ORIGIN ?? config.origin,
        publicKey: config.publicKey,
        target: config.target,
        onProgress: progress,
      })) ?? current;
  } catch (e) {
    progress("Hors ligne · ouverture de la version installée");
    await writeFile(
      join(base, "update-error.log"),
      new Date().toISOString() + " " + String(e) + "\n",
    );
  }
  const launch = async (id: string) => {
    const ready = join(base, `ready-${process.pid}`);
    await rm(ready, { force: true });
    const child = Bun.spawn(
      [executable(id), ...platformArgs, join(base, "releases", id, "app")],
      {
        env: { ...process.env, CUBIX_LAUNCH_READY: ready },
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
          JSON.stringify({ id, ready: true, at: new Date().toISOString() }),
        );
        await pruneReleases(base, id);
        return child;
      }
      await Bun.sleep(100);
    }
    if (child.exitCode === 0) return child;
    child.kill();
    await child.exited;
    return null;
  };
  progress("Démarrage de Cubix…");
  let child = await launch(current.id);
  if (!child) {
    const previous = await rollback(base, current.id);
    if (previous) {
      progress("Restauration de la version précédente…");
      child = await launch(previous.id);
    }
  }
  splash.kill();
  await splash.exited;
  if (!child) throw Error("Cubix could not start. See application.log.");
} finally {
  if (acquired) await rm(lock, { force: true });
}
