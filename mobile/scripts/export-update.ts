/**
 * Export the JavaScript bundle and assets as an over-the-air update: `bun scripts/export-update.ts`
 * writes `build/updates/` with Metro's output and an `update.json` describing the manifest to
 * publish (`PUT /api/mobile/updates` on the API, done by `scripts/deploy.ts` at the root).
 * The runtime version comes from app.config.ts, so the update only reaches APKs whose native
 * code matches.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { buildNumber, commitHash, runtimeVersion } from "../app.config";

const root = resolve(import.meta.dir, "..");
const out = resolve(root, process.argv.find(a => a.startsWith("--output="))?.slice("--output=".length) ?? "build/updates");
const build = buildNumber(), commit = commitHash(), runtime = runtimeVersion();
const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", CUBIX_BUILD_NUMBER: String(build), CUBIX_COMMIT: commit };

const run = (args: string[], capture = false) => {
  console.log(`$ bunx ${args.join(" ")}`);
  const result = spawnSync("bunx", args, { cwd: root, env, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout ?? "";
};
// Do not reuse transforms from a development/test export with another API origin.
run(["expo", "export", "--clear", "--platform", "android", "--output-dir", out]);
// What the application reads through Constants.expoConfig when it runs this update.
const expoClient = JSON.parse(run(["expo", "config", "--type", "public", "--json"], true)) as Record<string, unknown>;

const CONTENT_TYPES: Record<string, string> = {
  hbc: "application/javascript", js: "application/javascript", json: "application/json",
  ttf: "font/ttf", otf: "font/otf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
};
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
/** Keys identify assets across updates in the phone's cache, so they must change with the content: Metro's hashed names do. */
const entry = (path: string, ext: string) => {
  const kind = CONTENT_TYPES[ext];
  if (!kind) { console.error(`No content type for .${ext} (${path}); add it to export-update.ts`); process.exit(1); }
  return { path, hash: sha256(resolve(out, path)), key: basename(path, extname(path)), contentType: kind, fileExtension: `.${ext}` };
};
const metadata = JSON.parse(readFileSync(resolve(out, "metadata.json"), "utf8")) as { fileMetadata: { android: { bundle: string; assets: { path: string; ext: string }[] } } };
const android = metadata.fileMetadata.android;
const update = {
  runtimeVersion: runtime, build, commit,
  launchAsset: entry(android.bundle, extname(android.bundle).slice(1)),
  assets: android.assets.map(asset => entry(asset.path, asset.ext)),
  expoClient,
};
rmSync(resolve(out, "update.json"), { force: true });
writeFileSync(resolve(out, "update.json"), JSON.stringify(update, null, 2));
console.log(`Update ${build} (${commit.slice(0, 7)}) for runtime ${runtime}: ${update.assets.length + 1} files in ${out}`);
