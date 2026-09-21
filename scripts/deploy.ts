/**
 * Deploy the current `main` commit: push, rebuild the server on the Raspberry Pi through
 * pihost, then ship the phone build. Two things can reach phones:
 *
 *   - an over-the-air update: the JavaScript bundle exported by `expo export`, which
 *     installed applications fetch by themselves at their next launch. Published every time.
 *   - an APK, only needed when the native code changed, that is when the runtime version
 *     computed by mobile/app.config.ts differs from the one of the APK the server stores.
 *     Phones then show a "Download update" button.
 *
 *   bun scripts/deploy.ts              full deployment
 *   bun scripts/deploy.ts --skip-apk   server and over-the-air update only
 *   bun scripts/deploy.ts --apk        also rebuild the APK when the runtime version did not change
 *   bun scripts/deploy.ts --apk-only   rebuild and upload the APK for the deployed commit
 *   bun scripts/deploy.ts --update-only  export and publish the over-the-air update only
 *
 * The APK is not built on the Pi: Gradle needs more memory than the board has and Google
 * ships no ARM64 Linux NDK, so the phone build always happens on the developer's machine.
 * `CUBIX_DEPLOY_PASSWORD` (the server's admin password) authorises the uploads; when unset it
 * is read over SSH from the server's `.env`. The local `.env`, which Bun loads automatically,
 * holds the development password and must not be used here. `CUBIX_PI` (ssh target) and `CUBIX_ORIGIN` (public API) override the defaults.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { publishDesktop } from "../desktop/publish";
import { runtimeVersion } from "../mobile/app.config";

const root = resolve(import.meta.dir, "..");
const PI = process.env.CUBIX_PI ?? "vitrix@82.67.236.74";
const ORIGIN = (process.env.CUBIX_ORIGIN ?? "https://cubix.vitrixxl.fr").replace(/\/$/, "");
const APP = process.env.CUBIX_APP ?? "cubix";
const skipApk = process.argv.includes("--skip-apk");
const forceApk = process.argv.includes("--apk");
const apkOnly = process.argv.includes("--apk-only");
const updateOnly = process.argv.includes("--update-only");
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
if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") console.warn("Warning: not on main.");
console.log(`Deploying ${head.slice(0, 7)} (build ${build}, runtime ${runtime})`);

async function release(): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${ORIGIN}/api/mobile/release`, { signal: AbortSignal.timeout(10000) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

if (!apkOnly && !updateOnly) {
  run("git", ["push"]);
  run("ssh", [PI, "pihost", "update", APP]);
  // pihost returns once compose is up; wait until the new binary answers with this commit.
  const deadline = Date.now() + 5 * 60 * 1000;
  for (;;) {
    const info = await release();
    if (info?.commit === head) break;
    if (Date.now() > deadline) { console.error(`The server still reports ${info?.commit ?? "no commit"}; expected ${head}.`); process.exit(1); }
    await sleep(3000);
  }
  console.log(`Server runs ${head.slice(0, 7)}.`);
}

const deployed = await release();
if (deployed?.commit !== head) { console.error(`The server runs ${deployed?.commit ?? "an unknown commit"}, not ${head}; deploy the server first.`); process.exit(1); }

let password = process.env.CUBIX_DEPLOY_PASSWORD ?? "";
const adminPassword = () => {
  if (!password) password = run("ssh", [PI, "sed", "-n", "'s/^CUBIX_ADMIN_PASSWORD=//p'", `/srv/pihost/apps/${APP}/repo/.env`], { capture: true }).replace(/^["']|["']$/g, "");
  if (!password) { console.error("No admin password: set CUBIX_DEPLOY_PASSWORD or configure CUBIX_ADMIN_PASSWORD on the server."); process.exit(1); }
  return password;
};
const send = async (path: string, headers: Record<string, string>, body: BodyInit) => {
  const response = await fetch(`${ORIGIN}${path}`, { method: "PUT", headers: { Authorization: `Bearer ${adminPassword()}`, ...headers }, body, signal: AbortSignal.timeout(10 * 60 * 1000) });
  const answer = await response.text();
  if (!response.ok) { console.error(`${path} failed (${response.status}): ${answer}`); process.exit(1); }
  return JSON.parse(answer) as Record<string, any>;
};

// --- Over-the-air update: the JavaScript every installed application fetches by itself. ---
if (!apkOnly) {
  const published = (deployed.updates as Record<string, { commit?: string }> | undefined)?.[runtime];
  if (published?.commit === head) console.log(`The server already publishes this commit for runtime ${runtime}.`);
  else {
    run("bun", ["scripts/export-update.ts", `--output=${UPDATE_DIR}`], { cwd: resolve(root, "mobile") });
    const update = JSON.parse(readFileSync(resolve(UPDATE_DIR, "update.json"), "utf8")) as { runtimeVersion: string; launchAsset: { path: string; hash: string }; assets: { path: string; hash: string }[] };
    if (update.runtimeVersion !== runtime) { console.error(`The export targets runtime ${update.runtimeVersion}, expected ${runtime}.`); process.exit(1); }
    for (const asset of [update.launchAsset, ...update.assets]) {
      const bytes = readFileSync(resolve(UPDATE_DIR, asset.path));
      console.log(`Uploading ${asset.path} (${(bytes.length / 1024).toFixed(0)} KiB)`);
      await send(`/api/mobile/updates/assets/${asset.hash}`, { "Content-Type": "application/octet-stream" }, new Blob([bytes]));
    }
    const info = await send("/api/mobile/updates", { "Content-Type": "application/json" }, readFileSync(resolve(UPDATE_DIR, "update.json")));
    console.log(`Update ${info.updates?.[runtime]?.id} (build ${build}) is now served for runtime ${runtime}.`);
  }
}
// Desktop releases share the API and are built locally with Bun, including the Electron runtime.
if (!apkOnly && !updateOnly) {
  run("bun", ["desktop/package.ts"]);
  await publishDesktop(ORIGIN, adminPassword());
}
if (updateOnly || skipApk) process.exit(0);

// --- APK: only when the native code changed, since the JavaScript already travels over the air. ---
if (deployed.apkBuild === build && deployed.apkCommit === head) { console.log("The server already stores this build's APK."); process.exit(0); }
if (!forceApk && !apkOnly && deployed.apkRuntimeVersion === runtime) { console.log(`The stored APK already has runtime ${runtime}; no native change, no APK (pass --apk to force one).`); process.exit(0); }

// Low CPU priority: Gradle should not make the machine unusable while it runs.
run("nice", ["-n", "19", "bun", "scripts/build-apk.ts", "--arm64", `--output=${APK}`], { cwd: resolve(root, "mobile") });

const bytes = readFileSync(APK);
console.log(`Uploading ${(bytes.length / 1048576).toFixed(1)} MiB to ${ORIGIN}/api/mobile/apk`);
const info = await send("/api/mobile/apk", { "X-Cubix-Build": String(build), "X-Cubix-Commit": head, "X-Cubix-Runtime": runtime, "Content-Type": "application/vnd.android.package-archive" }, new Blob([bytes]));
console.log(`APK build ${info.apkBuild} (${String(info.apkCommit).slice(0, 7)}, runtime ${info.apkRuntimeVersion}) is now served by ${ORIGIN}/api/mobile/apk`);
