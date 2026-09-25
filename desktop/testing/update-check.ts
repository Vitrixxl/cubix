/** Ctrl+Shift+R checks for updates: "up to date" when there is none, otherwise a persistent download
 * toast with its progress, then a real restart into the new release. */
import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, cp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPairSync, sign } from "node:crypto";
import assert from "node:assert/strict";
import { sha256, type Manifest } from "../updater";
delete process.env.ELECTRON_RUN_AS_NODE;
const source = resolve(`artifacts/electron/cubix-${process.platform}-${process.arch}`);
const base = await mkdtemp(join(tmpdir(), "cubix-update-check-"));
const old = await Bun.file(join(source, "current.json")).json();
const installed: Manifest = await Bun.file(join(source, "releases", old.id, "release.json")).json();
const keys = generateKeyPairSync("ed25519");
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const signRelease = (manifest: Manifest) => {
  const raw = JSON.stringify(manifest);
  return { id: sha256(raw), signed: { manifest: raw, signature: sign(null, Buffer.from(raw), keys.privateKey).toString("base64") } };
};
// The same build as the installed one: nothing to download.
const current = signRelease(installed);
const manifest: Manifest = structuredClone(installed);
manifest.build++;
const path = "app/renderer/index.html";
const changed = await readFile(join(source, "releases", old.id, path), "utf8") + "\n<!-- update check test -->";
const file = manifest.files.find((file) => file.path === path)!;
file.sha256 = sha256(changed);
file.size = Buffer.byteLength(changed);
const next = signRelease(manifest);
let published = current;
let releaseDownload!: () => void;
const gate = new Promise<void>((resolve) => { releaseDownload = resolve; });
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/desktop/releases/")) return Response.json(published.signed);
    if (url.pathname.endsWith(file.sha256)) {
      await gate;
      return new Response(changed);
    }
    return new Response("missing", { status: 404 });
  },
});
let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
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
  app = await electron.launch({
    executablePath: join(base, "releases", old.id, "runtime/electron"),
    args: [`--ozone-platform=${process.env.CUBIX_OZONE_PLATFORM ?? "x11"}`, join(base, "releases", old.id, "app"), `--user-data-dir=${join(base, "config/Cubix")}`],
    env: {
      ...process.env,
      WAYLAND_DISPLAY: "",
      CUBIX_LAUNCHER_PATH: join(base, "cubix"),
      CUBIX_RELEASE_ID: old.id,
      CUBIX_DESKTOP_DATA: join(base, "data"),
      CUBIX_API_ORIGIN: server.url.origin,
      XDG_CONFIG_HOME: join(base, "config"),
    },
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".scramble .alg");
  await mkdir("artifacts/electron/testing", { recursive: true });
  const toasts = page.locator("[data-sonner-toast]");
  await page.keyboard.press("Control+Shift+R");
  await toasts.filter({ hasText: "Aucune mise à jour disponible" }).waitFor({ state: "visible" });
  await page.waitForTimeout(450); // Sonner entrance animation
  await page.screenshot({ path: "artifacts/electron/testing/update-check-none.png" });
  published = next;
  await page.keyboard.press("Control+Shift+R");
  const download = toasts.filter({ hasText: "Téléchargement de la mise à jour" });
  await download.waitFor({ state: "visible" });
  assert.equal(await download.getByRole("progressbar").getAttribute("aria-valuenow"), "0");
  await page.waitForTimeout(1500);
  assert.equal(await download.count(), 1, "The download toast stays until the download ends");
  assert.equal(await toasts.filter({ hasText: "Une mise à jour est disponible" }).count(), 0);
  await page.screenshot({ path: "artifacts/electron/testing/update-check-download.png" });
  releaseDownload();
  await waitFor(async () => {
    try { return (await Bun.file(join(base, "last-launch.json")).json()).id === next.id; }
    catch { return false; }
  });
  assert.equal((await Bun.file(join(base, "last-launch.json")).json()).ready, true);
  console.log("Update check: up-to-date toast, persistent download progress, real restart into the new release");
} finally {
  releaseDownload();
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
