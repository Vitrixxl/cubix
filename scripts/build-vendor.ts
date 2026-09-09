import { readdir, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
/** Preserve cubing.js module/worker URLs, bundling its bare package imports locally. */
export async function buildVendor(outdir = "build/vendor/cubing") {
  const root = resolve("node_modules/cubing/dist/lib/cubing");
  const entrypoints = (await readdir(root, { recursive: true })).filter(p => p.endsWith(".js")).map(p => join(root, p));
  const result = await Bun.build({ entrypoints, root, outdir, target: "browser", minify: true,
    plugins: [{ name: "preserve-cubing-modules", setup(build) {
      build.onResolve({ filter: /^\./ }, args => args.importer.startsWith(root + "/") ? { path: args.path, external: true } : undefined);
    } }],
  });
  if (!result.success) throw new Error(result.logs.join("\n"));
  await mkdir(outdir, { recursive: true });
  const notices: string[] = [];
  for (const name of ["cubing", "three", "random-uint-below", "@cubing/lazy-promise"]) {
    const dir = `node_modules/${name}`;
    const pkg = JSON.parse(await readFile(`${dir}/package.json`, "utf8"));
    notices.push(`${name} ${pkg.version} · ${pkg.license} · ${JSON.stringify(pkg.repository ?? "")}`);
    for (const file of await readdir(dir)) if (/^licen[sc]e/i.test(file)) notices.push(await readFile(`${dir}/${file}`, "utf8"));
  }
  await writeFile(join(outdir, "NOTICE.txt"), notices.join("\n\n"));
}
if (import.meta.main) await buildVendor();
