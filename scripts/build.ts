import { compressAssets } from "./compress-assets";
import { buildSeo } from "./build-seo";
import { buildModelWorker } from "./build-model-worker";
import { buildVendor } from "./build-vendor";
import { cp, rm, readdir, readFile, writeFile } from "node:fs/promises";

await rm("dist/view", { recursive: true, force: true });
const build = Bun.spawn([
  "bun", "build", "./src/frontend/index.html", "--outdir=dist/view",
  "--target=browser", "--production", "--splitting", "--public-path=/",
], { stdout: "inherit", stderr: "inherit" });
const status = await build.exited;
if (status !== 0) process.exit(status);
const admin = Bun.spawn(["bun", "build", "./src/admin/index.html", "--outdir=dist/view/admin", "--public-path=/admin/", "--target=browser", "--production"], {stdout:"inherit",stderr:"inherit"});
if (await admin.exited !== 0) process.exit(1);
await cp("public", "dist/view", { recursive: true });
await buildVendor("dist/view/vendor/cubing");
await buildModelWorker("dist/view/workers");
await buildSeo();

// An atomic shell cache includes the complete catalogue, fonts and PWA icons.
const files = (await readdir("dist/view", {recursive:true})).filter(path => !path.startsWith("admin/") && /\.(html|js|css|woff2|png|svg|webmanifest)$/.test(path)).sort();
const hash = new Bun.CryptoHasher("sha256");
for (const path of files) hash.update(await readFile("dist/view/"+path));
const template = await readFile("scripts/service-worker.js","utf8");
hash.update(template);
await writeFile("dist/view/sw.js",template.replace("__VERSION__",hash.digest("hex").slice(0,16)).replace("__ASSETS__",JSON.stringify(files.map(path => "/" + (path.endsWith("index.html") ? path.slice(0, -10) : path)))));

await compressAssets();
