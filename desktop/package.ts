/** Packages the Electron shell: the Electron runtime and desktop/dist, which opens the web app served by the
 * API. The app's code is not in the package, so the package only changes with the shell itself. */
import { chmod, cp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
process.chdir(resolve(import.meta.dir, ".."));
if (process.platform !== "linux" && process.platform !== "darwin")
  throw Error("Desktop packaging supports Linux and macOS; run the build on the target system.");
await import("./build");
if (process.platform === "darwin") {
  const { packageMac } = await import("./package-macos");
  await packageMac();
} else {
  const run = async (args: string[]) => {
    const p = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
    if (await p.exited) throw Error(`Failed: ${args[0]}`);
  };
  if (!(await Bun.file("node_modules/electron/path.txt").exists()))
    await run(["bun", "node_modules/electron/install.js"]);
  const base = resolve("artifacts/electron", `cubix-${process.platform}-${process.arch}`);
  await rm(base, { recursive: true, force: true });
  await mkdir(base, { recursive: true });
  await cp("desktop/dist", join(base, "app"), { recursive: true });
  await cp("node_modules/electron/dist", join(base, "runtime"), { recursive: true, dereference: true });
  await cp("desktop/NOTICE", join(base, "NOTICE"));
  await cp("desktop/licenses", join(base, "licenses"), { recursive: true });
  // Resolves its own location, so it also works through the ~/.local/bin/cubix symlink.
  // Without unprivileged user namespaces (Ubuntu 24.04's AppArmor, hardened kernels), Chromium falls back to
  // chrome-sandbox, which must be setuid root: an install without sudo can't, so start without the sandbox there.
  await Bun.write(join(base, "cubix"), `#!/bin/sh
here=$(dirname "$(readlink -f "$0")")
sandbox=
if [ ! -u "$here/runtime/chrome-sandbox" ] && command -v unshare >/dev/null 2>&1 && ! unshare -Ur true >/dev/null 2>&1; then
  sandbox=--no-sandbox
fi
exec "$here/runtime/electron" $sandbox "$here/app" "$@"
`);
  await chmod(join(base, "cubix"), 0o755);
  console.log(`Electron application: ${base}`);
}
