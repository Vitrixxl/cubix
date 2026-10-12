/**
 * Deploy the current `main` commit: push, rebuild the server on the Raspberry Pi through pihost (the image also builds
 * the web app), then ship the phone build. Two things can reach phones:
 *
 *   - an over-the-air update: the JavaScript bundle exported by `expo export`, which
 *     installed applications fetch by themselves at their next launch. Published every time; exported on this machine
 *     while the Pi builds the server, uploaded once the server answers.
 *   - an APK, only needed when the native code changed, that is when the runtime version
 *     computed by mobile/app.config.ts differs from the one of the APK the server stores.
 *     Phones then show a "Download update" button.
 *
 *   bun scripts/deploy.ts              full deployment
 *   bun scripts/deploy.ts --skip-apk   server and over-the-air update only
 *   bun scripts/deploy.ts --apk        also rebuild the APK when the runtime version did not change
 *   bun scripts/deploy.ts --apk-only   rebuild and upload the APK for the deployed commit
 *   bun scripts/deploy.ts --update-only  export and publish the over-the-air update only
 *   bun scripts/deploy.ts --no-push    main is pushed already (scripts/deploy-background.ts deploys a copy of it)
 *
 * The APK is not built on the Pi: Gradle needs more memory than the board has and Google
 * ships no ARM64 Linux NDK, so the phone build always happens on the developer's machine, with the release key of
 * ~/.config/cubix/keys (mobile/scripts/release-signing.ts): the build and the upload fail without it.
 * `CUBIX_DEPLOY_PASSWORD` (the server's admin password) authorises the uploads; when unset it
 * is read over SSH from the server's `.env`. The local `.env`, which Bun loads automatically,
 * holds the development password and must not be used here. `CUBIX_PI` (ssh target) and `CUBIX_ORIGIN` (public API) override the defaults.
 * The password only lets the server store files: phones check the over-the-air manifest against a key kept in
 * ~/.config/cubix/keys on this machine (mobile/README.md).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, openSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { runtimeVersion } from "../mobile/app.config";
import { validateProductionUpdate } from "../mobile/scripts/validate-update";
import { assertReleaseSigned } from "../mobile/scripts/release-signing";

const root = resolve(import.meta.dir, "..");
const PI = process.env.CUBIX_PI ?? "vitrix@82.67.236.74";
const ORIGIN = (process.env.CUBIX_ORIGIN ?? "https://cubix.vitrixxl.fr").replace(/\/$/, "");
const APP = process.env.CUBIX_APP ?? "cubix";
const skipApk = process.argv.includes("--skip-apk");
const forceApk = process.argv.includes("--apk");
const apkOnly = process.argv.includes("--apk-only");
const updateOnly = process.argv.includes("--update-only");
const noPush = process.argv.includes("--no-push");
const APK = resolve(root, "mobile/build/cubix-android-arm64.apk");
const UPDATE_DIR = resolve(root, "mobile/build/updates");

const run = (command: string, args: string[], options: { cwd?: string; capture?: boolean } = {}) => {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: options.cwd ?? root, encoding: "utf8", stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit" });
  if (result.status !== 0) { console.error(`${command} failed with status ${result.status}`); process.exit(result.status ?? 1); }
  return (result.stdout ?? "").trim();
};
const git = (...args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout.trim();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const head = git("rev-parse", "HEAD");
const build = Math.floor(Number(git("log", "-1", "--format=%ct")) / 60);
const runtime = runtimeVersion();
if (git("status", "--porcelain")) console.warn("Warning: the working tree has uncommitted changes; only the committed HEAD is deployed.");
if (!noPush && git("rev-parse", "--abbrev-ref", "HEAD") !== "main") console.warn("Warning: not on main.");
console.log(`Deploying ${head.slice(0, 7)} (build ${build}, runtime ${runtime})`);

/**
 * The over-the-air export (several minutes of Metro) starts at once, beside the Pi's build of the server: only its
 * upload needs the new server. Its output goes to a log, so it does not interleave with the build's.
 */
const EXPORT_LOG = resolve(root, "mobile/build/export-update.log");
let exporter: ChildProcess | undefined;
const exported = apkOnly ? null : new Promise<number>((done) => {
  mkdirSync(resolve(root, "mobile/build"), { recursive: true });
  const log = openSync(EXPORT_LOG, "w");
  console.log(`Exporting the over-the-air update in the background: ${EXPORT_LOG}`);
  exporter = spawn("bun", ["scripts/export-update.ts", `--output=${UPDATE_DIR}`], { cwd: resolve(root, "mobile"), stdio: ["ignore", log, log] });
  exporter.on("exit", (code) => done(code ?? 1));
});
// A deployment that stops early leaves no export running behind it.
process.on("exit", () => exporter?.kill());

async function release(): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${ORIGIN}/api/mobile/release`, { signal: AbortSignal.timeout(10000) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

if (!apkOnly && !updateOnly) {
  if (!noPush) run("git", ["push"]);
  // The build number and the commit go to the image as build arguments (compose.yaml): it reads no git history.
  run("ssh", [PI, `CUBIX_BUILD_NUMBER=${build}`, `CUBIX_COMMIT=${head}`, "pihost", "update", APP]);
  // pihost returns once compose is up; wait until the new binary answers with this commit.
  const deadline = Date.now() + 5 * 60 * 1000;
  for (;;) {
    const info = await release();
    if (info?.commit === head) break;
    if (Date.now() > deadline) { console.error(`The server still reports ${info?.commit ?? "no commit"}; expected ${head}.`); process.exit(1); }
    await sleep(3000);
  }
  console.log(`Server runs ${head.slice(0, 7)}.`);
  const page = await fetch(ORIGIN + "/", { signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!page?.ok || !(await page.text()).includes('id="root"')) { console.error(`The web app is not served at ${ORIGIN}/ (${page?.status ?? "no answer"}).`); process.exit(1); }
  console.log("Web app served.");
}

const deployed = await release();
if (deployed?.commit !== head) { console.error(`The server runs ${deployed?.commit ?? "an unknown commit"}, not ${head}; deploy the server first.`); process.exit(1); }

let password = process.env.CUBIX_DEPLOY_PASSWORD ?? "";
const adminPassword = () => {
  if (!password) password = run("ssh", [PI, "sed", "-n", "'s/^CUBIX_ADMIN_PASSWORD=//p'", `/srv/pihost/apps/${APP}/repo/.env`], { capture: true }).replace(/^["']|["']$/g, "");
  if (!password) { console.error("No admin password: set CUBIX_DEPLOY_PASSWORD or configure CUBIX_ADMIN_PASSWORD on the server."); process.exit(1); }
  return password;
};
/** PUTs a file with curl: Bun's fetch stalls on bodies of tens of MiB over a slow link (the APK never got through). */
const send = async (path: string, headers: Record<string, string>, file: string) => {
  // Ten minutes, or as long as the file takes at 8 KiB/s: the APK weighs tens of MiB and the link to the server has
  // carried files below 32 KiB/s.
  const seconds = Math.ceil(Math.max(10 * 60, statSync(file).size / (8 * 1024)));
  // The headers go through stdin, so the admin password never shows in the process list.
  const lines = Object.entries({ Authorization: `Bearer ${adminPassword()}`, ...headers }).map(([name, value]) => `${name}: ${value}`).join("\n");
  const curl = spawnSync("curl", ["-sS", "-X", "PUT", "-H", "@-", "--data-binary", `@${file}`, "--max-time", String(seconds), "-w", "\n%{http_code}", `${ORIGIN}${path}`], { input: lines, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const output = curl.stdout ?? "";
  const status = Number(output.slice(output.lastIndexOf("\n") + 1));
  const answer = output.slice(0, output.lastIndexOf("\n"));
  if (curl.status !== 0 || status < 200 || status >= 300) { console.error(`${path} failed (${curl.status !== 0 ? curl.stderr.trim() : status}): ${answer}`); process.exit(1); }
  return JSON.parse(answer) as Record<string, any>;
};

// --- Over-the-air update: the JavaScript every installed application fetches by itself. ---
if (!apkOnly) {
  const published = (deployed.updates as Record<string, { commit?: string }> | undefined)?.[runtime];
  if (published?.commit === head) {
    exporter?.kill();
    console.log(`The server already publishes this commit for runtime ${runtime}.`);
  }
  else {
    const code = await exported;
    if (code !== 0) { console.error(`The over-the-air export failed (${code}): ${EXPORT_LOG}\n${readFileSync(EXPORT_LOG, "utf8").slice(-4000)}`); process.exit(1); }
    const update = JSON.parse(readFileSync(resolve(UPDATE_DIR, "update.json"), "utf8")) as { runtimeVersion: string; expoClient: { updates: { url: string } }; launchAsset: { path: string; hash: string }; assets: { path: string; hash: string }[]; signature?: string };
    // Phones built with the certificate refuse an unsigned manifest: publishing one would only stall them.
    if (!update.signature) { console.error("The update is not signed: the expo-updates key is missing (see mobile/README.md)."); process.exit(1); }
    if (update.runtimeVersion !== runtime) { console.error(`The export targets runtime ${update.runtimeVersion}, expected ${runtime}.`); process.exit(1); }
    validateProductionUpdate(update, readFileSync(resolve(UPDATE_DIR, update.launchAsset.path)));
    for (const asset of [update.launchAsset, ...update.assets]) {
      // Assets are named by their hash: one the server stores already is the same file.
      const stored = await fetch(`${ORIGIN}/api/mobile/updates/assets/${asset.hash}`, { method: "HEAD", signal: AbortSignal.timeout(10000) }).then((r) => r.ok).catch(() => false);
      if (stored) continue;
      const file = resolve(UPDATE_DIR, asset.path);
      console.log(`Uploading ${asset.path} (${(statSync(file).size / 1024).toFixed(0)} KiB)`);
      await send(`/api/mobile/updates/assets/${asset.hash}`, { "Content-Type": "application/octet-stream" }, file);
    }
    const info = await send("/api/mobile/updates", { "Content-Type": "application/json" }, resolve(UPDATE_DIR, "update.json"));
    console.log(`Update ${info.updates?.[runtime]?.id} (build ${build}) is now served for runtime ${runtime}.`);
  }
}
if (updateOnly || skipApk) process.exit(0);

// --- APK: only when the native code changed, since the JavaScript already travels over the air. ---
if (deployed.apkBuild === build && deployed.apkCommit === head) { console.log("The server already stores this build's APK."); process.exit(0); }
if (!forceApk && !apkOnly && deployed.apkRuntimeVersion === runtime) { console.log(`The stored APK already has runtime ${runtime}; no native change, no APK (pass --apk to force one).`); process.exit(0); }

run("bun", ["scripts/build-apk.ts", "--arm64", "--production", `--output=${APK}`], { cwd: resolve(root, "mobile") });
// Never upload an APK signed with the public debug key: anyone could sign an update that takes over the installs.
assertReleaseSigned(APK);

console.log(`Uploading ${(statSync(APK).size / 1048576).toFixed(1)} MiB to ${ORIGIN}/api/mobile/apk`);
const info = await send("/api/mobile/apk", { "X-Cubix-Build": String(build), "X-Cubix-Commit": head, "X-Cubix-Runtime": runtime, "Content-Type": "application/vnd.android.package-archive" }, APK);
console.log(`APK build ${info.apkBuild} (${String(info.apkCommit).slice(0, 7)}, runtime ${info.apkRuntimeVersion}) is now served by ${ORIGIN}/api/mobile/apk`);
