/**
 * Builds the cube's world to WebAssembly: cubeworld/cubeworld.wasm, kept in the repository as the scrambler's is
 * (scrambler/build.ts), with the same wasm32-unknown-unknown target. Run it after changing cubeworld/src
 * (`bun run build:cubeworld`).
 */
import { copyFile } from "node:fs/promises";
import { join } from "node:path";

const dir = import.meta.dir;
const cargo = Bun.spawnSync(["cargo", "build", "--release", "--lib", "--target", "wasm32-unknown-unknown"], { cwd: dir, stdout: "inherit", stderr: "inherit" });
if (cargo.exitCode !== 0) throw new Error("cargo build failed (is the wasm32-unknown-unknown target installed?)");
await copyFile(join(dir, "target/wasm32-unknown-unknown/release/cubeworld.wasm"), join(dir, "cubeworld.wasm"));
console.log(`cubeworld/cubeworld.wasm: ${((await Bun.file(join(dir, "cubeworld.wasm")).arrayBuffer()).byteLength / 1024).toFixed(0)} KB`);
