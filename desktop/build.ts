/** All JavaScript compilation is performed by bun build, including Electron's two entrypoints. */
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
process.chdir(resolve(import.meta.dir, ".."));
export async function run(args: string[]) {
  const p = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
  if (await p.exited) throw Error(`Failed: ${args.join(" ")}`);
}
await mkdir("desktop/dist/renderer", { recursive: true });
await run([
  "bun",
  "build",
  "desktop/electron/main.ts",
  "--target=node",
  "--format=cjs",
  "--external=electron",
  "--outfile=desktop/dist/main.cjs",
]);
await run([
  "bun",
  "build",
  "desktop/electron/preload.ts",
  "--target=node",
  "--format=cjs",
  "--external=electron",
  "--outfile=desktop/dist/preload.cjs",
]);
await run([
  "bun",
  "build",
  "desktop/renderer/main.tsx",
  "--target=browser",
  "--outdir=desktop/dist/renderer",
  "--minify",
  "--define",
  'process.env.NODE_ENV="production"',
]);
await cp("desktop/renderer/index.html", "desktop/dist/renderer/index.html");
await cp("desktop/assets", "desktop/dist/assets", { recursive: true });
await cp("desktop/linux/fr.vitrixxl.cubix.png", "desktop/dist/assets/icon.png");
await run(["bun", "desktop/engine/build.ts"]);
await cp("desktop/bin", "desktop/dist/engine", { recursive: true });
await Bun.write(
  "desktop/dist/package.json",
  JSON.stringify({ name: "cubix-desktop", version: "0.1.0", main: "main.cjs" }),
);
