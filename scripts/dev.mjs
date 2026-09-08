import { spawn, spawnSync } from "node:child_process";
const build = spawnSync("sh", ["scripts/rust.sh", "build", "--locked"], { stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const api = spawn("./rust-api/target/debug/cubix-api", [], { stdio: "inherit", env: { ...process.env, PORT: "47129" } });
const web = spawn("./node_modules/.bin/vite", [], { stdio: "inherit" });
const cleanup = () => { api.kill(); web.kill(); };
process.on("SIGINT", cleanup); process.on("SIGTERM", cleanup);
for (const child of [api, web]) child.on("exit", (code) => { cleanup(); process.exitCode = code ?? 0; });
