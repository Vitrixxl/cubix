/** Local development against a seeded API in Docker (compose.dev.yaml): builds and starts the container,
 * then serves the local web sources on 127.0.0.1:5181 with /api proxied to it (desktop/dev.ts).
 *   bun run dev:docker             the web app, for a browser
 *   bun run dev:docker --electron  in the Electron window
 *   bun run dev:docker --reset     a fresh database, seeded again
 *   bun run dev:docker --stop      stops the container; its data is kept
 *   bun run dev:docker --go        the Go port of the API (compose.go-dev.yaml, port 47131) instead of Rust
 * The container keeps running after this script; the data lives in the `cubix-dev_data` volume. */
import { join, resolve } from "node:path";
import { homedir } from "node:os";
process.chdir(resolve(import.meta.dir, ".."));
const go = process.argv.includes("--go");
const compose = ["docker", "compose", "-f", go ? "compose.go-dev.yaml" : "compose.dev.yaml"];
const run = async (command: string[]) => {
  if (await Bun.spawn(command, { stdout: "inherit", stderr: "inherit", stdin: "inherit" }).exited) process.exit(1);
};
const flags = new Set(process.argv.slice(2));
if (flags.has("--stop")) {
  await run([...compose, "stop"]);
  process.exit(0);
}
if (flags.has("--reset")) await run([...compose, "down", "--volumes"]);
await run([...compose, "up", "--detach", "--build", "--wait"]);
await run([...compose, "logs", "--no-log-prefix", "--tail", "20", "api"]);
const port = process.env.CUBIX_DEV_API_PORT ?? (go ? "47131" : "47130");
console.log(`
Cubix dev API: http://127.0.0.1:${port} (it serves the web app of the image too)
Accounts: dev, coach, lena_speed, alex_cubes… password cubix-dev-password
Administration: /admin, token cbx_admin_dev
`);
// Its own port, browser storage and Electron data: nothing mixes with the production account.
const child = Bun.spawn(["bun", "desktop/dev.ts", ...(flags.has("--electron") ? [] : ["--web"])], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
  env: {
    ...process.env,
    CUBIX_API_ORIGIN: `http://127.0.0.1:${port}`,
    CUBIX_DEV_PORT: process.env.CUBIX_DEV_PORT ?? "5181",
    CUBIX_DESKTOP_DATA: join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"), "cubix-desktop-docker"),
  },
});
process.exit(await child.exited);
