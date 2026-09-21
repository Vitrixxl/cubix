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
const old = await Bun.file(join(source, "current.json")).json(),
  config = await Bun.file(join(source, "launcher.json")).json();
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
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/desktop/releases/"))
      return Response.json(published);
    const asset = assets.get(url.pathname.split("/").at(-1)!);
    if (asset !== undefined) {
      downloads++;
      return new Response(asset);
    }
    return new Response("missing", { status: 404 });
  },
});
let child: ReturnType<typeof Bun.spawn> | undefined;
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
      if (await Bun.file(join(base, "last-launch.json")).exists())
        return await Bun.file(join(base, "last-launch.json")).json();
      if (child.exitCode !== null)
        throw Error(await new Response(child.stderr as ReadableStream).text());
      await Bun.sleep(100);
    }
    throw Error(
      "Launcher readiness timeout: " +
        (await Bun.file(join(base, "application.log")).text()),
    );
  };
  const launched = await launch();
  assert.equal(launched.id, sha256(raw));
  assert.equal(downloads, 1);
  assert.equal(
    await Bun.file(join(base, "releases", launched.id, path)).text(),
    changed,
  );
  console.log(
    "Compiled launcher: authenticated update, one changed download, real Electron/Bun startup",
  );
  // Terminate only descendants created by this test before testing offline startup.
  const stop = async () => {
    if (!child) return;
    const ps = Bun.spawnSync(["ps", "-eo", "pid=,ppid="])
      .stdout.toString()
      .trim()
      .split("\n")
      .map((l) => l.trim().split(/\s+/).map(Number));
    const descendants = (pid: number): number[] =>
      ps
        .filter(([, ppid]) => ppid === pid)
        .flatMap(([id]) => [...descendants(id), id]);
    for (const pid of descendants(child.pid))
      try {
        process.kill(pid, "SIGTERM");
      } catch {}
    child.kill();
    await child.exited;
  };
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
  const recovered = await launch();
  assert.equal(recovered.id, launched.id);
  assert.equal(
    (await Bun.file(join(base, "failed.json")).json()).id,
    sha256(badRaw),
  );
  assert.equal(downloads, 2);
  console.log(
    "Compiled launcher: failed Electron release rolls back to the healthy version",
  );
  await stop();
  await Bun.sleep(200);
  assert.equal((await launch()).id, launched.id);
  assert.equal(downloads, 2);
  console.log("Compiled launcher: failed release remains quarantined");
  await stop();
  server.stop();
  await Bun.sleep(200);
  const offline = await launch();
  assert.equal(offline.id, launched.id);
  console.log("Compiled launcher: offline startup retains installed release");
  await stop();
  await Bun.write(
    "artifacts/electron/testing/launcher.json",
    JSON.stringify(
      {
        passed: true,
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
  child?.kill();
  server.stop();
  await rm(base, { recursive: true, force: true });
}
