import { spawn, spawnSync } from "node:child_process";

const build = spawnSync("sh", ["scripts/rust.sh", "build", "--locked"], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const api = spawn("./rust-api/target/debug/cubix-api", [], {
  stdio: "inherit",
  env: { ...process.env, CUBIX_HOST: "127.0.0.1", PORT: "47129", CUBIX_EXTRA_PORTS: "" },
});
const web = spawn(process.execPath, ["scripts/dev-web.ts"], { stdio: "inherit" });
let stopping = false;
function cleanup(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  api.kill();
  web.kill();
}
process.on("SIGINT", () => cleanup());
process.on("SIGTERM", () => cleanup());
for (const child of [api, web]) {
  child.on("error", error => { console.error(error); cleanup(1); });
  child.on("exit", code => cleanup(code ?? 0));
}
