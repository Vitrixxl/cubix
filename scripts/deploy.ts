/**
 * Deploy the current `main` commit: push, build the web app on this machine (it took minutes on the Pi) and send it to
 * the server's repository, outside git; when the API changed since the commit the server runs, rebuild it on the
 * Raspberry Pi through pihost meanwhile and wait until it answers with this commit; then point dist/web, which its
 * container reads at every request (compose.yaml), at the new build, and check the server gives it.
 *
 *   bun scripts/deploy.ts              full deployment
 *   bun scripts/deploy.ts --no-push    main is pushed already (scripts/deploy-background.ts deploys a copy of it)
 *
 * `CUBIX_PI` (ssh target) and `CUBIX_ORIGIN` (public API) override the defaults.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

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
// The server is rebuilt and restarted only when what its image is made of changed since the commit it runs; otherwise
// only the web app goes, which the server reads at every request.
const running = String((await release())?.commit ?? "");
const known = running !== "" && spawnSync("git", ["cat-file", "-e", `${running}^{commit}`], { cwd: root }).status === 0;
const api = !known || spawnSync("git", ["diff", "--quiet", running, "HEAD", "--", "go-api", "data", "Dockerfile", "compose.yaml", ".dockerignore"], { cwd: root }).status !== 0;
console.log(api ? "The API changed: the server is rebuilt." : `The API is unchanged since ${running.slice(0, 7)}: only the web app is deployed.`);
// The API's image builds on the Pi meanwhile, as pihost builds it (same project, files and build arguments): pihost
// then finds it in its cache. Its output goes to a log, so it does not interleave with the web app's build.
const pi = `/srv/pihost/apps/${APP}`;
const PREBUILD_LOG = resolve(root, "dist/prebuild.log");
mkdirSync(resolve(root, "dist"), { recursive: true });
const prebuild = api && new Promise<number>((done) => {
  const log = openSync(PREBUILD_LOG, "w");
  spawn("ssh", [PI, `set -e; git -C ${pi}/repo pull --ff-only -q; CUBIX_BUILD_NUMBER=${build} CUBIX_COMMIT=${head} docker compose --project-name pihost-${APP} --project-directory ${pi}/repo -f ${pi}/repo/compose.yaml -f ${pi}/override.yaml build --quiet`], { stdio: ["ignore", log, log] })
    .on("exit", (code) => done(code ?? 1));
});
// Away from dist/web, which the development server serves; never against a local API.
const WEB = resolve(root, "dist/deploy");
const { EXPO_PUBLIC_API_ORIGIN: _, ...env } = process.env;
run("bun", ["desktop/web.ts", WEB], { CUBIX_PRERENDER_JOBS: "3", ...env });
// Unpacked in a directory of its own beside the one served. Only what differs from the build served goes: the rest is
// hard-linked from it (the case diagrams and the phone app seldom change; the pages change with the app's scripts).
// Each build's list of files and their hashes is kept beside it, in files/, outside what the server serves.
const dist = `${pi}/repo/dist`;
const sums = new Map(await Promise.all((await readdir(WEB, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()).map(async (entry) => {
  const path = join(entry.parentPath, entry.name);
  return [relative(WEB, path), new Bun.CryptoHasher("sha1").update(await readFile(path)).digest("hex")] as const;
})));
const served = new Map(spawnSync("ssh", [PI, `cat ${dist}/files/"$(readlink ${dist}/web)" 2>/dev/null || true`], { encoding: "utf8", maxBuffer: 1 << 28 }).stdout
  .split("\n").filter(Boolean).map((line) => line.split("\t") as [string, string]));
// Sorted: each page beside its neighbours, whose likeness zstd finds again (it halves what goes).
const changed = [...sums].filter(([path, sum]) => served.get(path) !== sum).map(([path]) => path).sort();
writeFileSync(join(WEB, ".files"), [...sums].map((entry) => entry.join("\t")).join("\n") + "\n");
writeFileSync(join(WEB, ".gone"), [...served.keys()].filter((path) => !sums.has(path)).map((path) => path + "\n").join(""));
writeFileSync(resolve(root, "dist/deploy.list"), [".files", ".gone", ...changed].join("\n") + "\n");
console.log(`Sending ${changed.length} of ${sums.size} files.`);
// tar replaces a file it extracts over by a new one: a hard-linked file of the build served stays as it is.
run("bash", ["-o", "pipefail", "-c", `tar -C "${WEB}" -cf - --verbatim-files-from -T "${resolve(root, "dist/deploy.list")}" | zstd -3 -T0 -q | ssh ${PI} 'set -e; mkdir -p ${dist}/files; cd ${dist}; rm -rf next; ${served.size ? "cp -al web/. next" : "mkdir next"}; zstd -dcq | tar -xf - -C next; cd next; xargs -r -d "\\n" rm -f -- < .gone; rm .gone; name=web-$(date +%s); mv .files ../files/$name; cd ..; mv next $name'`]);
if (prebuild) {
  // pihost builds it again if that failed, and shows why.
  if ((await prebuild) !== 0) console.warn(`Building the API ahead on the Pi failed: ${PREBUILD_LOG}\n${readFileSync(PREBUILD_LOG, "utf8").slice(-2000)}`);
  // The build number and the commit go to the image as build arguments (compose.yaml): it reads no git history.
  run("ssh", [PI, `CUBIX_BUILD_NUMBER=${build}`, `CUBIX_COMMIT=${head}`, "pihost", "update", APP]);
}
// dist/web then links to the new build, renamed over the old link at once; the previous build stays for the pages
// still open on it, older ones go.
run("ssh", [PI, `set -e; cd ${dist}; [ -L web ] || rm -rf web; ln -sfn "$(ls -d web-* | sort | tail -n 1)" web.next; mv -T web.next web; for old in $(ls -d web-* | sort | head -n -2); do rm -rf "$old" "files/$old"; done`]);
if (api) {
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
// The service worker names the build's version: the server must give this build's.
const worker = await fetch(ORIGIN + "/sw.js", { signal: AbortSignal.timeout(10000) }).then((r) => (r.ok ? r.text() : null)).catch(() => null);
if (worker !== readFileSync(resolve(WEB, "sw.js"), "utf8")) { console.error(`${ORIGIN}/sw.js is not this build's.`); process.exit(1); }
const page = await fetch(ORIGIN + "/", { signal: AbortSignal.timeout(10000) }).catch(() => null);
if (!page?.ok || !(await page.text()).includes('id="root"')) { console.error(`The web app is not served at ${ORIGIN}/ (${page?.status ?? "no answer"}).`); process.exit(1); }
console.log("Web app served.");
