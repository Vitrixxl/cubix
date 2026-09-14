/** Install the standalone GPUI build and its launcher for the current user. */
import {cp, mkdir, mkdtemp, rename, symlink, chmod} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';

if (process.platform !== 'linux') throw Error('This installer is for Linux');
process.chdir(resolve(import.meta.dir, '..'));
async function run(args: string[]) {
  const child = Bun.spawn(args, {stdout: 'inherit', stderr: 'inherit'});
  if (await child.exited) throw Error(`Command failed: ${args[0]}`);
}
if (!process.argv.includes('--skip-build')) await run(['bun', 'desktop/package.ts']);
const source = resolve(`artifacts/gpui/cubix-linux-${process.arch}`);
for (const file of ['cubix-desktop', 'cubix-engine', 'assets/catalog.json']) {
  if (!await Bun.file(join(source, file)).exists()) throw Error(`Missing build: ${file}`);
}
const data = process.env.XDG_DATA_HOME || join(homedir(), '.local/share');
const base = join(data, 'cubix-gpui');
const releases = join(base, 'releases');
const applications = join(data, 'applications');
const icons = join(data, 'icons/hicolor/512x512/apps');
await mkdir(releases, {recursive: true});
await mkdir(applications, {recursive: true});
await mkdir(icons, {recursive: true});
const release = await mkdtemp(join(releases, 'build-'));
// Switch only after all assets and both executables have been installed.
await cp(source, release, {recursive: true});
await chmod(join(release, 'cubix-desktop'), 0o755);
await chmod(join(release, 'cubix-engine'), 0o755);
const current = join(base, 'current');
const next = join(base, `current-${process.pid}`);
await symlink(release, next);
await rename(next, current);
await cp('desktop/linux/fr.vitrixxl.cubix.png', join(icons, 'fr.vitrixxl.cubix.png'));
// Desktop Entry values require literal backslashes to be escaped.
const pathValue = current.replaceAll('\\', '\\\\');
const template = await Bun.file('desktop/linux/fr.vitrixxl.cubix.desktop').text();
const entry = join(applications, 'fr.vitrixxl.cubix.desktop');
const staged = join(base, 'fr.vitrixxl.cubix.desktop');
await Bun.write(staged, template.replaceAll('@APP@', pathValue));
await run(['desktop-file-validate', staged]);
await chmod(staged, 0o644);
await rename(staged, entry);
await run(['update-desktop-database', applications]);
await run(['gtk-update-icon-cache', '-f', '-t', join(data, 'icons/hicolor')]);
console.log(`Installed Cubix GPUI: ${entry}`);
