/**
 * Deploy the current `main` commit: push, build the web app on this machine (it took minutes on the Pi) and send it to
 * the server's repository, outside git, where dist/web links to it, then rebuild the server on the Raspberry Pi through
 * pihost (its container mounts dist/web, compose.yaml), and wait until it answers with this commit and serves the web
 * app.
 *
 *   bun scripts/deploy.ts              full deployment
 *   bun scripts/deploy.ts --no-push    main is pushed already (scripts/deploy-background.ts deploys a copy of it)
 *
 * `CUBIX_PI` (ssh target) and `CUBIX_ORIGIN` (public API) override the defaults.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const PI = process.env.CUBIX_PI ?? "vitrix@82.67.236.74";
const ORIGIN = (process.env.CUBIX_ORIGIN ?? "https://cubix.vitrixxl.fr").replace(/\/$/, "");
const APP = process.env.CUBIX_APP ?? "cubix";
const noPush = process.argv.includes("--no-push");

const run = (command: string, args: string[], env = process.env) => {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env });
  if (result.status !== 0) { console.error(`${command} failed with status ${result.status}`); process.exit(result.status ?? 1); }
};
const git = (...args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout.trim();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const head = git("rev-parse", "HEAD");
const build = Math.floor(Number(git("log", "-1", "--format=%ct")) / 60);
if (git("status", "--porcelain")) console.warn("Warning: the working tree has uncommitted changes; only the committed HEAD is deployed.");
if (!noPush && git("rev-parse", "--abbrev-ref", "HEAD") !== "main") console.warn("Warning: not on main.");
console.log(`Deploying ${head.slice(0, 7)} (build ${build})`);

async function release(): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${ORIGIN}/api/mobile/release`, { signal: AbortSignal.timeout(10000) });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

if (!noPush) run("git", ["push"]);
// The API's image builds on the Pi meanwhile, as pihost builds it (same project, files and build arguments): pihost
// then finds it in its cache. Its output goes to a log, so it does not interleave with the web app's build.
const pi = `/srv/pihost/apps/${APP}`;
const PREBUILD_LOG = resolve(root, "dist/prebuild.log");
mkdirSync(resolve(root, "dist"), { recursive: true });
const prebuild = new Promise<number>((done) => {
  const log = openSync(PREBUILD_LOG, "w");
  spawn("ssh", [PI, `set -e; git -C ${pi}/repo pull --ff-only -q; CUBIX_BUILD_NUMBER=${build} CUBIX_COMMIT=${head} docker compose --project-name pihost-${APP} --project-directory ${pi}/repo -f ${pi}/repo/compose.yaml -f ${pi}/override.yaml build --quiet`], { stdio: ["ignore", log, log] })
    .on("exit", (code) => done(code ?? 1));
});
// Away from dist/web, which the development server serves; never against a local API.
const WEB = resolve(root, "dist/deploy");
const { EXPO_PUBLIC_API_ORIGIN: _, ...env } = process.env;
run("bun", ["desktop/web.ts", WEB], { CUBIX_PRERENDER_JOBS: "3", ...env });
// Unpacked in a directory of its own, then dist/web links to it: the running container keeps the build it mounted until
// pihost replaces it. The previous build stays too (a failed deployment leaves the container on it); older ones go.
const dist = `${pi}/repo/dist`;
const unpack = `set -e; mkdir -p ${dist}; cd ${dist}; rm -rf next; mkdir next; zstd -dcq | tar -xf - -C next; mv next web-$(date +%s); ls -d web-* | sort | head -n -2 | xargs -r rm -rf; [ -L web ] || rm -rf web; ln -sfn "$(ls -d web-* | sort | tail -n 1)" web`;
run("bash", ["-o", "pipefail", "-c", `tar -C "${WEB}" -cf - . | zstd -3 -T0 -q | ssh ${PI} '${unpack}'`]);
// pihost builds it again if that failed, and shows why.
if ((await prebuild) !== 0) console.warn(`Building the API ahead on the Pi failed: ${PREBUILD_LOG}\n${readFileSync(PREBUILD_LOG, "utf8").slice(-2000)}`);
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
