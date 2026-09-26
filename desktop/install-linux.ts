/** Installs the Electron shell for the current user, replacing any previous installation (launcher included). */
import { cp, mkdir, rename, rm, symlink } from "node:fs/promises";
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
for (const file of ["cubix", "runtime/electron", "app/main.cjs", "app/preload.cjs"])
  if (!(await Bun.file(join(source, file)).exists())) throw Error(`Missing build: ${file}`);
const data = process.env.XDG_DATA_HOME || join(homedir(), ".local/share");
const base = join(data, "cubix-electron");
const applications = join(data, "applications");
const icons = join(data, "icons/hicolor/512x512/apps");
await mkdir(applications, { recursive: true });
await mkdir(icons, { recursive: true });
// Swap whole directories; private data stays in cubix-desktop.
await rm(base + ".new", { recursive: true, force: true });
await cp(source, base + ".new", { recursive: true });
await rm(base + ".old", { recursive: true, force: true });
await rename(base, base + ".old").catch((error) => { if (error.code !== "ENOENT") throw error; });
await rename(base + ".new", base);
await rm(base + ".old", { recursive: true, force: true });
await cp("desktop/linux/fr.vitrixxl.cubix.png", join(icons, "fr.vitrixxl.cubix.png"));
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
const command = join(bin, "cubix");
await rm(command, { force: true });
await symlink(join(base, "cubix"), command);
console.log(`Installed Cubix: ${base} (command: ${command})`);
