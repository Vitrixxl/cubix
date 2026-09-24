/** Bundle Electron, the Bun engine and an independent Bun launcher. No Electron Forge/Vite/Webpack. */
import {
  cp,
  mkdir,
  readdir,
  stat,
  readFile,
  writeFile,
  chmod,
  rm,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { sha256, type Manifest, type ReleaseFile } from "./updater";
import "./build";
process.chdir(resolve(import.meta.dir, ".."));
const run = async (args: string[]) => {
  const p = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
  if (await p.exited) throw Error(`Failed: ${args[0]}`);
};
if (!(await Bun.file("node_modules/electron/path.txt").exists()))
  await run(["bun", "node_modules/electron/install.js"]);
const target = `${process.platform}-${process.arch}`,
  base = resolve("artifacts/electron", `cubix-${target}`),
  stage = join(base, "release");
await rm(stage, { recursive: true, force: true });
await mkdir(join(stage, "app"), { recursive: true });
await cp("desktop/dist", join(stage, "app"), { recursive: true });
await run([
  "bun",
  "build",
  "desktop/bin/main.js",
  "--compile",
  "--outfile",
  join(
    stage,
    "app",
    process.platform === "win32" ? "cubix-engine.exe" : "cubix-engine",
  ),
]);
await cp("desktop/bin/vendor", join(stage, "app/vendor"), { recursive: true });
await cp("node_modules/electron/dist", join(stage, "runtime"), {
  recursive: true,
  dereference: true,
});
await cp("desktop/NOTICE", join(stage, "NOTICE"));
await cp("desktop/licenses", join(stage, "licenses"), { recursive: true });
const keyPath =
  process.env.CUBIX_DESKTOP_SIGNING_KEY ??
  join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "cubix",
    "desktop-signing.pem",
  );
let pem: string;
try {
  pem = await readFile(keyPath, "utf8");
} catch (e: any) {
  if (e.code !== "ENOENT") throw e;
  await mkdir(resolve(keyPath, ".."), { recursive: true, mode: 0o700 });
  pem = generateKeyPairSync("ed25519")
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();
  await writeFile(keyPath, pem, { mode: 0o600, flag: "wx" });
  console.log(
    `Desktop signing key created at ${keyPath}. Keep it to publish compatible updates.`,
  );
}
const key = createPrivateKey(pem),
  publicKey = createPublicKey(key)
    .export({ type: "spki", format: "pem" })
    .toString();
const files: ReleaseFile[] = [];
async function walk(dir: string, prefix = "") {
  for (const item of (await readdir(dir, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const rel = prefix + item.name,
      path = join(dir, item.name);
    if (item.isDirectory()) await walk(path, rel + "/");
    else if (item.isFile()) {
      const info = await stat(path);
      files.push({
        path: rel,
        sha256: sha256(await readFile(path)),
        size: info.size,
        executable: !!(info.mode & 0o111),
      });
    }
  }
}
await mkdir(join(stage, "bootstrap"), { recursive: true });
await run([
  "bun",
  "build",
  "desktop/launcher.ts",
  "--compile",
  "--outfile",
  join(stage, "bootstrap", process.platform === "win32" ? "cubix.exe" : "cubix"),
]);
await run([
  "bun",
  "build",
  "desktop/electron/splash.ts",
  "--target=node",
  "--format=cjs",
  "--external=electron",
  "--outfile",
  join(stage, "bootstrap/splash.cjs"),
]);
// The startup window's renderer: the same React primitives, stylesheet, icons and fonts as the app.
await run(["bun", "build", "desktop/renderer/launcher.tsx", "--target=browser", "--outdir", join(stage, "bootstrap/launcher/renderer"), "--minify", "--define", 'process.env.NODE_ENV="production"']);
await run(["bun", "build", "desktop/electron/splash-preload.ts", "--target=node", "--format=cjs", "--external=electron", "--outfile", join(stage, "bootstrap/launcher/preload.cjs")]);
await cp("desktop/renderer/launcher.html", join(stage, "bootstrap/launcher/renderer/index.html"));
for (const directory of ["fonts", "icons"]) await cp(join("desktop/assets", directory), join(stage, "bootstrap/launcher/assets", directory), { recursive: true });
await cp("desktop/linux/fr.vitrixxl.cubix.png", join(stage, "bootstrap/launcher/assets/icon.png"));
await walk(stage);
// The launcher binary is announced, not listed: at startup a slow connection could not download its
// ~80 MB within the launcher's deadlines, so the running application fetches it in the background.
const launcherName = process.platform === "win32" ? "cubix.exe" : "cubix";
const launcherFile = files.find((f) => f.path === `bootstrap/${launcherName}`);
if (!launcherFile) throw Error("Launcher binary missing from the release bootstrap");
files.splice(files.indexOf(launcherFile), 1);
const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"])
  .stdout.toString()
  .trim();
const manifest: Manifest = {
  schema: 1,
  target,
  build: Number(process.env.CUBIX_DESKTOP_BUILD ?? Date.now()),
  commit,
  files,
  launcher: { sha256: launcherFile.sha256, size: launcherFile.size },
};
const raw = JSON.stringify(manifest),
  signed = {
    manifest: raw,
    signature: sign(null, Buffer.from(raw), key).toString("base64"),
  };
await Bun.write(join(stage, "release.json"), raw);
await Bun.write(join(stage, "signed-release.json"), JSON.stringify(signed));
await Bun.write(join(base, "release.json"), JSON.stringify(signed));
for (const name of [process.platform === "win32" ? "cubix.exe" : "cubix", "splash.cjs", "launcher"])
  await cp(join(stage, "bootstrap", name), join(base, name), { recursive: true });
await Bun.write(
  join(base, "launcher.json"),
  JSON.stringify({
    target,
    publicKey,
    origin: process.env.CUBIX_API_ORIGIN ?? "https://cubix.vitrixxl.fr",
  }),
);
const id = sha256(raw);
await mkdir(join(base, "releases"), { recursive: true });
// Keep the build inspectable and ready to run through the same pointer as installed copies.
await cp(stage, join(base, "releases", id), { recursive: true });
await Bun.write(join(base, "current.json"), JSON.stringify({ id }));
console.log(`Electron application: ${base}`);
