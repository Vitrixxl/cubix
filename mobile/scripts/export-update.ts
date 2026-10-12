/**
 * Export the JavaScript bundle and assets as an over-the-air update: `bun scripts/export-update.ts`
 * writes `build/updates/` with Metro's output and an `update.json` describing the manifest to
 * publish (`PUT /api/mobile/updates` on the API, done by `scripts/deploy.ts` at the root).
 * The runtime version comes from app.config.ts, so the update only reaches APKs whose native
 * code matches.
 *
 * The manifest phones receive is written here, whole, and signed with the expo-updates key
 * (`CUBIX_UPDATES_SIGNING_KEY`, by default ~/.config/cubix/keys/expo-updates/private-key.pem), which never
 * leaves this machine: the server serves the text as it is, and APKs embedding certs/certificate.pem refuse any
 * other. Without the key the update is exported unsigned (scripts/deploy.ts then refuses to publish it).
 */
import { spawnSync } from "node:child_process";
import { createHash, randomUUID, sign, verify, X509Certificate } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { API_ORIGIN, buildNumber, commitHash, runtimeVersion } from "../app.config";

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
// The camera page of the assisted solve is generated (scripts/build-scan.ts): never ship a missing or stale one.
if (spawnSync("bun", ["scripts/build-scan.ts"], { cwd: root, env, stdio: "inherit" }).status !== 0) process.exit(1);
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
// What GET /api/mobile/updates/manifest answers (expo-updates protocol 1). The asset addresses are fixed here, on the
// server the bundle talks to, since the signature covers them.
const served = ({ hash, key, contentType, fileExtension }: ReturnType<typeof entry>) =>
  ({ hash: Buffer.from(hash, "hex").toString("base64url"), key, contentType, fileExtension, url: `${API_ORIGIN}/api/mobile/updates/assets/${hash}` });
const manifest = JSON.stringify({
  id: randomUUID(), createdAt: new Date().toISOString(), runtimeVersion: runtime,
  launchAsset: served(update.launchAsset), assets: update.assets.map(served), metadata: {}, extra: { expoClient },
});
const key = process.env.CUBIX_UPDATES_SIGNING_KEY ?? join(homedir(), ".config/cubix/keys/expo-updates/private-key.pem");
let signature: string | undefined;
if (existsSync(key)) {
  // RSA PKCS#1 v1.5 over SHA-256, the `rsa-v1_5-sha256` app.config.ts announces.
  signature = sign("sha256", Buffer.from(manifest), readFileSync(key)).toString("base64");
  // A key that does not match the certificate in the APKs would get every update refused: stop here instead.
  const certificate = new X509Certificate(readFileSync(resolve(root, "certs/certificate.pem")));
  if (!verify("sha256", Buffer.from(manifest), certificate.publicKey, Buffer.from(signature, "base64"))) {
    console.error(`${key} does not match certs/certificate.pem`);
    process.exit(1);
  }
} else console.warn(`No signing key at ${key}: the update is not signed, and phones with the certificate will refuse it.`);
rmSync(resolve(out, "update.json"), { force: true });
writeFileSync(resolve(out, "update.json"), JSON.stringify({ ...update, manifest, signature }, null, 2));
console.log(`Update ${build} (${commit.slice(0, 7)}) for runtime ${runtime}: ${update.assets.length + 1} files in ${out}`);
