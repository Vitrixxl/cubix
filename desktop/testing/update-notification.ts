/** A verified download produces a Sonner action that really restarts into the new release. */
import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, cp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPairSync, sign } from "node:crypto";
import assert from "node:assert/strict";
import { installUpdate, sha256, type Manifest } from "../updater";
delete process.env.ELECTRON_RUN_AS_NODE;
const source = resolve(`artifacts/electron/cubix-${process.platform}-${process.arch}`);
const base = await mkdtemp(join(tmpdir(), "cubix-update-notice-"));
const old = await Bun.file(join(source, "current.json")).json();
const manifest: Manifest = await Bun.file(join(source, "releases", old.id, "release.json")).json();
manifest.build++;
const path = "app/renderer/index.html";
const changed = await readFile(join(source, "releases", old.id, path), "utf8") + "\n<!-- notification restart test -->";
const file = manifest.files.find((file) => file.path === path)!;
file.sha256 = sha256(changed);
file.size = Buffer.byteLength(changed);
const keys = generateKeyPairSync("ed25519");
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const raw = JSON.stringify(manifest);
const id = sha256(raw);
const signed = { manifest: raw, signature: sign(null, Buffer.from(raw), keys.privateKey).toString("base64") };
let releaseDownload!: () => void;
const gate = new Promise<void>((resolve) => { releaseDownload = resolve; });
let downloading = false;
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/desktop/releases/")) return Response.json(signed);
    if (url.pathname.endsWith(file.sha256)) {
      downloading = true;
      await gate;
      return new Response(changed);
    }
    return new Response("missing", { status: 404 });
  },
});
let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
let installation: Promise<unknown> | undefined;
const waitFor = async (predicate: () => Promise<boolean>) => {
  for (let n = 0; n < 300; n++) {
    if (await predicate()) return;
    await Bun.sleep(100);
  }
  throw Error("Timed out waiting for update restart");
};
try {
  await mkdir(join(base, "releases"));
  await cp(join(source, "releases", old.id), join(base, "releases", old.id), { recursive: true });
  for (const name of ["cubix", "current.json"]) await cp(join(source, name), join(base, name));
  await Bun.write(join(base, "launcher.json"), JSON.stringify({ target: manifest.target, publicKey, origin: server.url.origin }));
  const env = {
    ...process.env,
    WAYLAND_DISPLAY: "",
    CUBIX_LAUNCHER_PATH: join(base, "cubix"),
    CUBIX_RELEASE_ID: old.id,
    CUBIX_DESKTOP_DATA: join(base, "data"),
    CUBIX_API_ORIGIN: server.url.origin,
    XDG_CONFIG_HOME: join(base, "config"),
  };
  app = await electron.launch({
    executablePath: join(base, "releases", old.id, "runtime/electron"),
    args: ["--ozone-platform=x11", join(base, "releases", old.id, "app"), `--user-data-dir=${join(base, "config/Cubix")}`],
    env,
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".scramble .alg");
  await page.setViewportSize({ width: 480, height: 540 });
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: "Une mise à jour est disponible" });
  assert.equal(await toast.count(), 0);
  assert.equal(await page.evaluate(() => window.cubix.availableUpdate()), null);
  await page.evaluate(() => window.cubix.call("preference", "cubix.ui.theme", "t3-code"));
  installation = installUpdate({ base, origin: server.url.origin, publicKey, target: manifest.target });
  await waitFor(async () => downloading);
  assert.equal(await page.evaluate(() => window.cubix.availableUpdate()), null);
  assert.equal(await toast.count(), 0, "No offer while the update is incomplete");
  await page.keyboard.down("Space");
  await page.waitForSelector('.timer[data-phase="Ready"]');
  await page.keyboard.up("Space");
  await page.waitForSelector('.timer[data-phase="Running"]');
  releaseDownload();
  await installation;
  assert.equal(await page.evaluate(() => window.cubix.availableUpdate()), id);
  await page.waitForTimeout(300);
  assert.equal(await toast.count(), 0, "No interruption during a solve");
  await page.keyboard.press("a");
  await toast.waitFor({ state: "visible" });
  await page.waitForSelector('[data-action^="penalty:"]');
  await page.waitForTimeout(450); // Sonner entrance animation
  const bounds = await toast.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 480 && bounds.y >= 0 && bounds.y + bounds.height <= 540);
  await mkdir("artifacts/electron/testing", { recursive: true });
  await page.screenshot({ path: "artifacts/electron/testing/update-notification.png" });
  await toast.getByRole("button", { name: "Plus tard", exact: true }).click();
  await toast.waitFor({ state: "detached" });
  await page.evaluate(() => window.cubix.availableUpdate());
  await page.waitForTimeout(250);
  assert.equal(await toast.count(), 0, "Dismissal is respected for this session");
  await page.reload();
  await toast.waitFor({ state: "visible" });
  await toast.getByRole("button", { name: "Redémarrer", exact: true }).click();
  await waitFor(async () => {
    try { return (await Bun.file(join(base, "last-launch.json")).json()).id === id; }
    catch { return false; }
  });
  const storage = await Bun.file(join(base, "data/storage.json")).json();
  assert.equal(JSON.parse(storage["cubix.ui.theme"]), "t3-code");
  assert.equal((await Bun.file(join(base, "last-launch.json")).json()).ready, true);
  console.log("Update notification: verified download, deferred during solve, responsive Sonner, real restart into new release, preferences preserved");
} finally {
  releaseDownload();
  await installation?.catch(() => {});
  await app?.close().catch(() => {});
  // A restarted app is detached from Playwright; terminate only this fixture's processes.
  const rows = Bun.spawnSync(["ps", "-eo", "pid=,args="]).stdout.toString().split("\n");
  for (const row of rows) {
    if (row.includes(base)) {
      const pid = Number(row.trim().split(/\s+/)[0]);
      try { process.kill(pid, "SIGTERM"); } catch {}
    }
  }
  server.stop(true);
  await Bun.sleep(300);
  await rm(base, { recursive: true, force: true });
}
