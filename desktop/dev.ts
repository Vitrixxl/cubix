delete process.env.ELECTRON_RUN_AS_NODE;
import { resolve } from "node:path";
process.chdir(resolve(import.meta.dir, ".."));
const build = Bun.spawn(["bun", "desktop/build.ts"], {
  stdout: "inherit",
  stderr: "inherit",
});
if (await build.exited) process.exit(1);
if (!(await Bun.file("node_modules/electron/path.txt").exists())) {
  const install = Bun.spawn(["bun", "node_modules/electron/install.js"], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await install.exited) process.exit(1);
}
const electron = resolve(
  "node_modules/electron/dist",
  process.platform === "win32"
    ? "electron.exe"
    : process.platform === "darwin"
      ? "Electron.app/Contents/MacOS/Electron"
      : "electron",
);
const platformArgs =
  process.platform === "linux" && !process.env.WAYLAND_DISPLAY
    ? ["--ozone-platform=x11"]
    : [];
const child = Bun.spawn([electron, ...platformArgs, "desktop/dist"], {
  env: { ...process.env, CUBIX_BUN: process.execPath },
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await child.exited);
