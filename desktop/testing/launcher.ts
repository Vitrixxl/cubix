/** End-to-end update of a packaged app, with a real HTTP server and the compiled Bun launcher. */
import { mkdtemp, cp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir, homedir } from "node:os";
import { createPrivateKey, sign } from "node:crypto";
import assert from "node:assert/strict";
import { sha256, type Manifest } from "../updater";
delete process.env.ELECTRON_RUN_AS_NODE;
const source = resolve(
    `artifacts/electron/cubix-${process.platform}-${process.arch}`,
  ),
  base = await mkdtemp(join(tmpdir(), "cubix-launcher-test-"));
const old = await Bun.file(join(source, "current.json")).json();
const original = (await Bun.file(
  join(source, "releases", old.id, "release.json"),
).json()) as Manifest;
const manifest = structuredClone(original);
manifest.build++;
const path = "app/renderer/index.html",
  changed =
    (await readFile(join(source, "releases", old.id, path), "utf8")) +
    "\n<!-- verified launcher update -->\n",
  file = manifest.files.find((f) => f.path === path)!;
file.sha256 = sha256(changed);
file.size = Buffer.byteLength(changed);
const key = createPrivateKey(
    await readFile(
      process.env.CUBIX_DESKTOP_SIGNING_KEY ??
        join(
          process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
          "cubix/desktop-signing.pem",
        ),
    ),
  ),
  raw = JSON.stringify(manifest),
  signed = {
    manifest: raw,
    signature: sign(null, Buffer.from(raw), key).toString("base64"),
  };
let published = signed;
const assets = new Map([[file.sha256, changed]]);
let downloads = 0;
let releaseManifest!: () => void;
let releaseAsset!: () => void;
const manifestGate = new Promise<void>((resolve) => { releaseManifest = resolve; });
const assetGate = new Promise<void>((resolve) => { releaseAsset = resolve; });
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/desktop/releases/")) {
      await manifestGate;
      return Response.json(published);
    }
    const asset = assets.get(url.pathname.split("/").at(-1)!);
    if (asset !== undefined) {
      downloads++;
      await assetGate;
      return new Response(asset);
    }
    return new Response("missing", { status: 404 });
  },
});
let child: ReturnType<typeof Bun.spawn> | undefined;
let appPid: number | undefined;
// Electron outlives the launcher; retain its PID so tests clean up their own app.
const stop = async () => {
  const ps = Bun.spawnSync(["ps", "-eo", "pid=,ppid="])
    .stdout.toString().trim().split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const descendants = (pid: number): number[] => ps
    .filter(([, ppid]) => ppid === pid)
    .flatMap(([id]) => [...descendants(id), id]);
  for (const pid of new Set([
    ...(appPid ? [...descendants(appPid), appPid] : []),
    ...(child ? [...descendants(child.pid), child.pid] : []),
  ])) {
    try { process.kill(pid, "SIGTERM"); } catch {}
  }
  if (child) await child.exited;
  appPid = undefined;
};
const updated = async () => {
  assert.equal(await child!.exited, 0);
  return await Bun.file(join(base, "current.json")).json();
};
try {
  await mkdir(join(base, "releases"), { recursive: true });
  await cp(join(source, "releases", old.id), join(base, "releases", old.id), {
    recursive: true,
  });
  for (const name of ["cubix", "splash.cjs", "launcher.json", "current.json"])
    await cp(join(source, name), join(base, name));
  const launch = async () => {
    await rm(join(base, "last-launch.json"), { force: true });
    child = Bun.spawn([join(base, "cubix")], {
      env: {
        ...process.env,
        CUBIX_DESKTOP_DATA: join(base, "data"),
        CUBIX_API_ORIGIN: server.url.origin,
        XDG_CONFIG_HOME: join(base, "config"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    for (let i = 0; i < 450; i++) {
      if (await Bun.file(join(base, "last-launch.json")).exists()) {
        const result = await Bun.file(join(base, "last-launch.json")).json();
        appPid = result.pid;
        return result;
      }
      if (child.exitCode !== null)
        throw Error(await new Response(child.stderr as ReadableStream).text());
      await Bun.sleep(100);
    }
    throw Error(
      "Launcher readiness timeout: " +
        (await Bun.file(join(base, "application.log")).text()),
    );
  };
  const first = await launch();
  assert.equal(first.id, old.id);
  assert.equal(downloads, 0);
  // A server that has not answered cannot hold the installed app's startup.
  process.kill(appPid!, 0);
  console.log(`Compiled launcher: ready in ${first.startupMs} ms before update server responds`);
  releaseManifest();
  for (let i = 0; i < 200 && !downloads; i++) await Bun.sleep(100);
  assert.equal(downloads, 1);
  assert.equal((await Bun.file(join(base, "current.json")).json()).id, old.id);
  process.kill(appPid!, 0);
  const updater = child!;
  process.kill(appPid!, "SIGTERM");
  await Bun.sleep(500);
  const reopened = await launch();
  assert.equal(reopened.id, old.id);
  assert.equal(downloads, 1);
  assert.equal((await updated()).id, old.id);
  assert.equal(updater.exitCode, null);
  console.log("Compiled launcher: closing and reopening stays fast during an unfinished download");
  child = updater;
  releaseAsset();
  assert.equal((await updated()).id, sha256(raw));
  assert.equal(
    await Bun.file(join(base, "releases", sha256(raw), path)).text(),
    changed,
  );
  await stop();
  const broken = structuredClone(manifest);
  broken.build++;
  const entry = broken.files.find((f) => f.path === "app/main.cjs")!;
  const badMain = "process.exit(42);";
  entry.sha256 = sha256(badMain);
  entry.size = Buffer.byteLength(badMain);
  assets.set(entry.sha256, badMain);
  const badRaw = JSON.stringify(broken);
  published = {
    manifest: badRaw,
    signature: sign(null, Buffer.from(badRaw), key).toString("base64"),
  };
  await Bun.sleep(200);
  const launched = await launch();
  assert.equal(launched.id, sha256(raw));
  assert.equal((await updated()).id, sha256(badRaw));
  assert.equal(downloads, 2);
  console.log("Compiled launcher: prepared update runs on the next launch");
  await stop();
  await Bun.sleep(200);
  const recovered = await launch();
  assert.equal(recovered.id, launched.id);
  assert.equal(
    (await Bun.file(join(base, "failed.json")).json()).id,
    sha256(badRaw),
  );
  await updated();
  assert.equal(downloads, 2);
  console.log("Compiled launcher: failed release rolls back and stays quarantined");
  await stop();
  await Bun.sleep(200);
  assert.equal((await launch()).id, launched.id);
  await updated();
  assert.equal(downloads, 2);
  await stop();
  server.stop();
  await Bun.sleep(200);
  const offline = await launch();
  assert.equal(offline.id, launched.id);
  await updated();
  console.log(`Compiled launcher: offline startup ready in ${offline.startupMs} ms`);
  await stop();
  await Bun.write(
    "artifacts/electron/testing/launcher.json",
    JSON.stringify(
      {
        passed: true,
        startupMs: first.startupMs,
        nonBlockingUpdates: true,
        changedDownloads: downloads,
        updated: true,
        offline: true,
        rollback: true,
        quarantine: true,
      },
      null,
      2,
    ),
  );
} finally {
  releaseManifest();
  releaseAsset();
  await stop();
  server.stop();
  await rm(base, { recursive: true, force: true });
}
