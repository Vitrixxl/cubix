import { cp, rm } from "node:fs/promises";

await rm("dist/view", { recursive: true, force: true });
const build = Bun.spawn([
  "bun", "build", "./src/frontend/index.html", "--outdir=dist/view",
  "--target=browser", "--production", "--splitting",
], { stdout: "inherit", stderr: "inherit" });
const status = await build.exited;
if (status !== 0) process.exit(status);
await cp("public", "dist/view", { recursive: true });
