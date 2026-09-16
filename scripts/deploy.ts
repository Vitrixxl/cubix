/**
 * Deploy the current `main` commit: push, rebuild the server on the Raspberry Pi through
 * pihost, then build the ARM64 APK here and upload it to the API so phones can update.
 *
 *   bun scripts/deploy.ts              full deployment
 *   bun scripts/deploy.ts --skip-apk   server only
 *   bun scripts/deploy.ts --apk-only   rebuild and upload the APK for the deployed commit
 *
 * The APK is not built on the Pi: Gradle needs more memory than the board has and Google
 * ships no ARM64 Linux NDK, so the phone build always happens on the developer's machine.
 * `CUBIX_DEPLOY_PASSWORD` (the server's admin password) authorises the upload; when unset it
 * is read over SSH from the server's `.env`. The local `.env`, which Bun loads automatically,
 * holds the development password and must not be used here. `CUBIX_PI` (ssh target) and `CUBIX_ORIGIN` (public API) override the defaults.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const PI = process.env.CUBIX_PI ?? "vitrix@82.67.236.74";
const ORIGIN = (process.env.CUBIX_ORIGIN ?? "https://cubix.vitrixxl.fr").replace(/\/$/, "");
const APP = process.env.CUBIX_APP ?? "cubix";
const skipApk = process.argv.includes("--skip-apk");
const apkOnly = process.argv.includes("--apk-only");
const APK = resolve(root, "mobile/build/cubix-android-arm64.apk");

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
if (git("status", "--porcelain")) console.warn("Warning: the working tree has uncommitted changes; only the committed HEAD is deployed.");
if (git("rev-parse", "--abbrev-ref", "HEAD") !== "main") console.warn("Warning: not on main.");
console.log(`Deploying ${head.slice(0, 7)} (build ${build})`);

async function release(): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${ORIGIN}/api/mobile/release`, { signal: AbortSignal.timeout(10000) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

if (!apkOnly) {
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

if (skipApk) process.exit(0);

const deployed = await release();
if (deployed?.commit !== head) { console.error(`The server runs ${deployed?.commit ?? "an unknown commit"}, not ${head}; deploy the server first.`); process.exit(1); }
if (deployed.apkBuild === build && deployed.apkCommit === head) { console.log("The server already stores this build's APK."); process.exit(0); }

// Low CPU priority: Gradle should not make the machine unusable while it runs.
run("nice", ["-n", "19", "bun", "scripts/build-apk.ts", "--arm64", `--output=${APK}`], { cwd: resolve(root, "mobile") });

let password = process.env.CUBIX_DEPLOY_PASSWORD ?? "";
if (!password) password = run("ssh", [PI, "sed", "-n", "'s/^CUBIX_ADMIN_PASSWORD=//p'", `/srv/pihost/apps/${APP}/repo/.env`], { capture: true }).replace(/^["']|["']$/g, "");
if (!password) { console.error("No admin password: set CUBIX_DEPLOY_PASSWORD or configure CUBIX_ADMIN_PASSWORD on the server."); process.exit(1); }

const bytes = readFileSync(APK);
console.log(`Uploading ${(bytes.length / 1048576).toFixed(1)} MiB to ${ORIGIN}/api/mobile/apk`);
const response = await fetch(`${ORIGIN}/api/mobile/apk`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${password}`, "X-Cubix-Build": String(build), "X-Cubix-Commit": head, "Content-Type": "application/vnd.android.package-archive" },
  body: new Blob([bytes]),
  signal: AbortSignal.timeout(10 * 60 * 1000),
});
const answer = await response.text();
if (!response.ok) { console.error(`Upload failed (${response.status}): ${answer}`); process.exit(1); }
const info = JSON.parse(answer) as Record<string, unknown>;
console.log(`APK build ${info.apkBuild} (${String(info.apkCommit).slice(0, 7)}) is now served by ${ORIGIN}/api/mobile/apk`);
