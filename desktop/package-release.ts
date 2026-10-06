/**
 * The desktop packages the server hands out (rust-api/src/desktop.rs) and the landing page's install commands fetch:
 * Linux x64 as a .tar.gz (installed by /install.sh) and Windows x64 as a .zip (installed by /install.ps1), both built
 * here from the Electron shell. The Windows build needs no Windows: Packager assembles it from Electron's own build.
 *
 * `desktopVersion()` names them: a digest of the shell's sources and of Electron's version, so a deployment uploads
 * them only when the shell changed (the app itself is the web build, deployed on its own).
 *
 *   bun desktop/package-release.ts   builds both into artifacts/desktop
 */
import { packager } from "@electron/packager";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dir, "..");
export const OUT = join(root, "artifacts/desktop");
export const PACKAGES = { linux: "cubix-linux-x64.tar.gz", windows: "cubix-windows-x64.zip" } as const;
/** What the shell is made of: a change to any of these is a new desktop version. */
const SOURCES = ["desktop/electron", "desktop/platform.ts", "desktop/data-path.ts", "desktop/build.ts", "desktop/package.ts", "desktop/package-release.ts", "desktop/linux/fr.vitrixxl.cubix.png", "desktop/NOTICE", "desktop/licenses"];
/** The languages kept from Electron's own: the app's are English and French. */
const LOCALES = new Set(["en-US.pak", "fr.pak"]);

const run = async (args: string[], cwd = root) => {
  const child = Bun.spawn(args, { cwd, stdout: "inherit", stderr: "inherit" });
  if (await child.exited) throw Error(`Failed: ${args.join(" ")}`);
};
async function files(path: string): Promise<string[]> {
  const full = join(root, path);
  if (await Bun.file(full).exists()) return [path];
  const entries = await readdir(full, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => relative(root, join(e.parentPath, e.name))).sort();
}
export async function desktopVersion() {
  const hasher = new Bun.CryptoHasher("sha256");
  const { version } = await Bun.file(join(root, "node_modules/electron/package.json")).json();
  hasher.update(`electron ${version}\n`);
  for (const source of SOURCES) for (const file of await files(source)) hasher.update(file).update(await Bun.file(join(root, file)).arrayBuffer());
  return hasher.digest("hex").slice(0, 16);
}
const pruneLocales = async (dir: string) => {
  for (const name of await readdir(dir)) if (!LOCALES.has(name)) await rm(join(dir, name));
};
/** An .ico holding the 256-pixel icon as PNG, which Windows reads since Vista: for the Start menu shortcut. */
async function icon(output: string) {
  const png = await sharp(join(root, "desktop/linux/fr.vitrixxl.cubix.png")).resize(256, 256).png().toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(0, 6); // 256 wide
  header.writeUInt8(0, 7); // 256 high
  header.writeUInt16LE(1, 10); // planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // offset of the image
  await Bun.write(output, Buffer.concat([header, png]));
}

export async function packageRelease() {
  if (process.platform !== "linux" || process.arch !== "x64") throw Error("Build the desktop packages on Linux x64.");
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  // Linux: the shell package.ts assembles (desktop/dist built on the way), with its icon for the installer.
  await run(["bun", "desktop/package.ts"]);
  const linux = join(root, "artifacts/electron/cubix-linux-x64");
  await cp(join(root, "desktop/linux/fr.vitrixxl.cubix.png"), join(linux, "fr.vitrixxl.cubix.png"));
  await pruneLocales(join(linux, "runtime/locales"));
  await run(["tar", "-czf", join(OUT, PACKAGES.linux), "-C", join(root, "artifacts/electron"), "cubix-linux-x64"]);
  // Windows: Packager's Electron for win32, the same desktop/dist inside.
  const { version: electronVersion } = await Bun.file(join(root, "node_modules/electron/package.json")).json();
  const [windows] = await packager({
    dir: join(root, "desktop/dist"),
    out: join(root, "artifacts/electron"),
    name: "Cubix",
    platform: "win32",
    arch: "x64",
    electronVersion,
    asar: true,
    overwrite: true,
    extraResource: [join(root, "desktop/NOTICE"), join(root, "desktop/licenses")],
  });
  await pruneLocales(join(windows!, "locales"));
  await icon(join(windows!, "Cubix.ico"));
  await run(["bsdtar", "-a", "-cf", join(OUT, PACKAGES.windows), "-C", join(root, "artifacts/electron"), "Cubix-win32-x64"]);
  for (const name of Object.values(PACKAGES)) console.log(`${name}: ${(Bun.file(join(OUT, name)).size / 1048576).toFixed(1)} MiB`);
  return { version: await desktopVersion() };
}

if (import.meta.main) {
  const { version } = await packageRelease();
  console.log(`Desktop ${version} in ${relative(root, OUT)}`);
}
