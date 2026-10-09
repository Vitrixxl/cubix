/**
 * Deploys `main` without holding the terminal: pushes it, then runs scripts/deploy.ts in the background on a copy of
 * that commit (a git worktree under ~/.cache/cubix-deploy), so work can go on in this checkout, even commits and pushes,
 * without anything of it reaching the deployment. Its output goes to a log; a desktop notification says how it ended.
 *
 *   bun run deploy:bg              full deployment (the arguments are scripts/deploy.ts's: --skip-apk, --apk…)
 *   bun run deploy:bg --status     the deployment under way, if any, and the last log
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const home = join(homedir(), ".cache/cubix-deploy");
const logs = join(home, "logs");
const lock = join(home, "running.json");
mkdirSync(logs, { recursive: true });
const git = (...args: string[]) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
const alive = (pid: number) => { try { return process.kill(pid, 0); } catch { return false; } };
const running = existsSync(lock) ? (JSON.parse(readFileSync(lock, "utf8")) as { pid: number; head: string; log: string }) : null;

if (process.argv.includes("--status")) {
  if (running && alive(running.pid)) console.log(`Deploying ${running.head.slice(0, 7)}: tail -f ${running.log}`);
  else console.log("No deployment under way.");
  const last = readdirSync(logs).sort().at(-1);
  if (last) console.log(`Last log: ${join(logs, last)}`);
  process.exit(0);
}
if (running && alive(running.pid)) {
  console.error(`A deployment of ${running.head.slice(0, 7)} is under way: tail -f ${running.log}`);
  process.exit(1);
}
if (git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim() !== "main") {
  console.error("Deploy from main.");
  process.exit(1);
}
const head = git("rev-parse", "HEAD").stdout.trim();
if (spawnSync("git", ["push", "origin", "main"], { cwd: root, stdio: "inherit" }).status !== 0) process.exit(1);

// The commit as it is now, away from this checkout; the dependencies are this checkout's.
const copy = join(home, head.slice(0, 12));
if (existsSync(copy)) git("worktree", "remove", "--force", copy);
rmSync(copy, { recursive: true, force: true });
git("worktree", "prune");
if (git("worktree", "add", "--detach", copy, head).status !== 0) { console.error(`Could not check ${head} out in ${copy}`); process.exit(1); }
// Hard links where they can be (Metro, which bundles the phone app, does not follow a linked node_modules), else links.
for (const dir of ["node_modules", "mobile/node_modules"]) {
  if (!existsSync(join(root, dir))) continue;
  if (spawnSync("cp", ["-al", join(root, dir), join(copy, dir)]).status !== 0) {
    rmSync(join(copy, dir), { recursive: true, force: true });
    symlinkSync(join(root, dir), join(copy, dir));
  }
}

const log = join(logs, `${new Date().toISOString().replace(/[:.]/g, "-")}-${head.slice(0, 7)}.log`);
const out = openSync(log, "a");
// The Android app's generated files (its postinstall) are not in git; then the deployment, then the copy goes.
const script = `
cd "$COPY/mobile" && bun scripts/build-scrambler.ts && bun scripts/build-cases.ts && cd "$COPY" && bun scripts/deploy.ts --no-push "$@"
status=$?
if [ $status -eq 0 ]; then message="Cubix ${head.slice(0, 7)} is deployed"; else message="Cubix ${head.slice(0, 7)} failed to deploy (status $status): $LOG"; fi
echo "$message"
notify-send "Cubix deployment" "$message" 2>/dev/null || true
git -C "$ROOT" worktree remove --force "$COPY"; rm -f "$LOCK"
exit $status`;
const child = spawn("sh", ["-c", script, "deploy", ...process.argv.slice(2)], {
  cwd: copy,
  detached: true,
  stdio: ["ignore", out, out],
  env: { ...process.env, COPY: copy, ROOT: root, LOG: log, LOCK: lock },
});
writeFileSync(lock, JSON.stringify({ pid: child.pid, head, log }));
child.unref();
console.log(`Deploying ${head.slice(0, 7)} in the background: tail -f ${log}`);
