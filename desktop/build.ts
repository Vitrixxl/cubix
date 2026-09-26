/** Builds the Electron shell into desktop/dist; the app itself is the web build (desktop/web.ts). */
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
process.chdir(resolve(import.meta.dir, ".."));
export async function run(args: string[]) {
  const p = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
  if (await p.exited) throw Error(`Failed: ${args.join(" ")}`);
}
await rm("desktop/dist", { recursive: true, force: true });
await mkdir("desktop/dist", { recursive: true });
for (const [entry, output] of [["desktop/electron/main.ts", "main.cjs"], ["desktop/electron/preload.ts", "preload.cjs"]])
  await run(["bun", "build", entry, "--target=node", "--format=cjs", "--external=electron", "--minify", `--outfile=desktop/dist/${output}`]);
await cp("desktop/electron/offline.html", "desktop/dist/offline.html");
await cp("desktop/linux/fr.vitrixxl.cubix.png", "desktop/dist/icon.png");
await Bun.write("desktop/dist/package.json", JSON.stringify({ name: "cubix-desktop", version: "0.1.0", main: "main.cjs" }));
