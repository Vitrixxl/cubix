/** A disposable Rust API serving the web build (dist/web) and the Electron shell pointed at it. */
import { _electron as electron } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
delete process.env.ELECTRON_RUN_AS_NODE;

export async function startServer(dir: string, env: Record<string, string> = {}) {
  await mkdir(dir, { recursive: true });
  const reserve = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = reserve.port!;
  reserve.stop();
  const origin = `http://127.0.0.1:${port}`;
  const server = Bun.spawn([resolve("rust-api/target/release/cubix-api")], {
    env: { ...process.env, PORT: String(port), CUBIX_HOST: "127.0.0.1", CUBIX_DB: join(dir, "server.db"), CUBIX_WEB_DIR: resolve("dist/web"), CUBIX_EXIT_WITH_PARENT: "1", ...env },
    stdout: "ignore",
    stderr: "inherit",
  });
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(origin + "/api/health")).ok) return { origin, server }; } catch {}
    await Bun.sleep(50);
  }
  server.kill();
  throw Error("The test API did not start");
}

export function launchApp({ dir, origin, ozone = process.env.CUBIX_OZONE_PLATFORM ?? "x11", env = {} }: { dir: string; origin: string; ozone?: string; env?: Record<string, string> }) {
  return electron.launch({
    executablePath: process.env.CUBIX_TEST_ELECTRON ?? resolve("node_modules/electron/dist/electron"),
    args: [`--ozone-platform=${ozone}`, resolve("desktop/dist")],
    env: { ...process.env, CUBIX_DESKTOP_DATA: dir, CUBIX_WEB_ORIGIN: origin, ...env },
    timeout: 30000,
  });
}
