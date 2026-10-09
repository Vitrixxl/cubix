/**
 * The Tauri shell's packages, served next to the Electron ones (go-api/desktop.go): Linux x64 as a .tar.gz
 * (`install.sh --tauri`) and Windows x64 as a .zip (`install.ps1` with CUBIX_SHELL=tauri). Both are built in Docker
 * (desktop/tauri/Dockerfile), so the machine needs neither WebKitGTK's headers nor a Windows toolchain; the build also
 * leaves a .deb and an NSIS installer in desktop/tauri/target, not served.
 *
 * `desktopVersion()` names them as desktop/package-release.ts names Electron's: a digest of the shell's sources, so a
 * deployment uploads them only when the shell changed.
 *
 *   bun desktop/tauri/package.ts   builds both into artifacts/tauri
 */
import { chmod, cp, mkdir, readdir, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const here = "desktop/tauri";
export const OUT = join(root, "artifacts/tauri");
export const PACKAGES = { linux: "cubix-tauri-linux-x64.tar.gz", windows: "cubix-tauri-windows-x64.zip" } as const;
/** What the shell is made of: a change to any of these is a new version. */
const SOURCES = ["Cargo.toml", "Cargo.lock", "build.rs", "tauri.conf.json", "Dockerfile", "package.ts", "src", "offline", "icons"]
  .map((path) => `${here}/${path}`)
  .concat(["desktop/linux/fr.vitrixxl.cubix.png", "desktop/NOTICE", "desktop/licenses"]);
const IMAGE = "cubix-tauri-build";

const run = async (args: string[]) => {
  const child = Bun.spawn(args, { cwd: root, stdout: "inherit", stderr: "inherit" });
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
  for (const source of SOURCES) for (const file of await files(source)) hasher.update(file).update(await Bun.file(join(root, file)).arrayBuffer());
  return hasher.digest("hex").slice(0, 16);
}
/** Runs `command` in the build container, as the current user, on this checkout; caches stay in desktop/tauri/target. */
export async function container(command: string, options: string[] = []) {
  await run(["docker", "build", "-q", "-t", IMAGE, here]);
  const cache = `/src/${here}/target`;
  await run([
    "docker", "run", "--rm", "-u", `${process.getuid!()}:${process.getgid!()}`, "-v", `${root}:/src`, "-w", `/src/${here}`,
    "-e", "HOME=/tmp", "-e", `CARGO_HOME=${cache}/cargo`, "-e", `XWIN_CACHE_DIR=${cache}/xwin`, ...options,
    IMAGE, "sh", "-ec", command,
  ]);
}

export async function packageRelease() {
  if (process.platform !== "linux" || process.arch !== "x64") throw Error("Build the Tauri packages on Linux x64.");
  await container([
    "cargo tauri build --bundles deb",
    "cargo tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis",
  ].join("\n"));
  const target = join(root, here, "target");
  await rm(OUT, { recursive: true, force: true });
  const pack = async (folder: string, executable: [string, string], icon: [string, string]) => {
    const dir = join(OUT, folder);
    await mkdir(dir, { recursive: true });
    await cp(executable[0], join(dir, executable[1]));
    await chmod(join(dir, executable[1]), 0o755);
    await cp(icon[0], join(dir, icon[1]));
    await cp(join(root, "desktop/NOTICE"), join(dir, "NOTICE"));
    await cp(join(root, "desktop/licenses"), join(dir, "licenses"), { recursive: true });
    return dir;
  };
  // The same layouts as Electron's packages, which the installers expect: `cubix` and its icon; Cubix.exe and Cubix.ico.
  await pack("cubix-tauri-linux-x64", [join(target, "release/cubix"), "cubix"], [join(root, "desktop/linux/fr.vitrixxl.cubix.png"), "fr.vitrixxl.cubix.png"]);
  await run(["tar", "-czf", join(OUT, PACKAGES.linux), "-C", OUT, "cubix-tauri-linux-x64"]);
  await pack("cubix-tauri-windows-x64", [join(target, "x86_64-pc-windows-msvc/release/cubix.exe"), "Cubix.exe"], [join(root, here, "icons/icon.ico"), "Cubix.ico"]);
  await run(["bsdtar", "-a", "-cf", join(OUT, PACKAGES.windows), "-C", OUT, "cubix-tauri-windows-x64"]);
  for (const name of Object.values(PACKAGES)) console.log(`${name}: ${(Bun.file(join(OUT, name)).size / 1048576).toFixed(1)} MiB`);
  return { version: await desktopVersion() };
}

if (import.meta.main) {
  const { version } = await packageRelease();
  console.log(`Tauri desktop ${version} in ${relative(root, OUT)}`);
}
