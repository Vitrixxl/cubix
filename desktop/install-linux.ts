/** Install the standalone Electron build and its launcher for the current user. */
import {
  cp,
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  chmod,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform !== "linux") throw Error("This installer is for Linux");
process.chdir(resolve(import.meta.dir, ".."));
async function run(args: string[]) {
  const child = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
  if (await child.exited) throw Error(`Command failed: ${args[0]}`);
}
if (!process.argv.includes("--skip-build"))
  await run(["bun", "desktop/package.ts"]);
const source = resolve(`artifacts/electron/cubix-linux-${process.arch}`);
for (const file of ["cubix", "launcher.json", "current.json"]) {
  if (!(await Bun.file(join(source, file)).exists()))
    throw Error(`Missing build: ${file}`);
}
const data = process.env.XDG_DATA_HOME || join(homedir(), ".local/share");
const base = join(data, "cubix-electron");
const applications = join(data, "applications");
const icons = join(data, "icons/hicolor/512x512/apps");
await mkdir(base, { recursive: true });
await mkdir(applications, { recursive: true });
await mkdir(icons, { recursive: true });
// Install release files first, then commit the pointer. Existing private data stays in cubix-desktop.
const current = await Bun.file(join(source, "current.json")).json();
if (!/^[a-f0-9]{64}$/.test(current.id)) throw Error("Invalid release pointer");
await mkdir(join(base, "releases"), { recursive: true });
await cp(
  join(source, "releases", current.id),
  join(base, "releases", current.id),
  { recursive: true },
);
for (const name of ["cubix", "splash.cjs", "launcher.json"]) {
  await cp(join(source, name), join(base, name + ".new"));
  if (name === "cubix") await chmod(join(base, name + ".new"), 0o755);
  await rename(join(base, name + ".new"), join(base, name));
}
await cp(join(source, "current.json"), join(base, "current.new"));
await rename(join(base, "current.new"), join(base, "current.json"));
await cp(
  "desktop/linux/fr.vitrixxl.cubix.png",
  join(icons, "fr.vitrixxl.cubix.png"),
);
const escaped = join(base, "cubix")
  .replaceAll("\\", "\\\\")
  .replaceAll('"', '\\"')
  .replaceAll("`", "\\`")
  .replaceAll("$", "\\$");
const entry = `[Desktop Entry]\nType=Application\nName=Cubix\nComment=Cube timer and algorithm trainer\nExec="${escaped}"\nIcon=fr.vitrixxl.cubix\nTerminal=false\nCategories=Game;Education;\nStartupWMClass=Cubix\n`;
await Bun.write(join(applications, "fr.vitrixxl.cubix.desktop"), entry);
for (const args of [
  ["update-desktop-database", applications],
  ["gtk-update-icon-cache", "-f", "-t", join(data, "icons/hicolor")],
]) {
  if (Bun.which(args[0])) await run(args);
}
const bin = join(homedir(), ".local/bin");
await mkdir(bin, { recursive: true });
const launcher = join(bin, "cubix");
await rm(launcher, { force: true });
await symlink(join(base, "cubix"), launcher);
console.log(`Installed Cubix Electron: ${base} (command: ${launcher})`);
export {};
