/**
 * Builds the scrambler to WebAssembly: scrambler/scrambler.wasm, kept in the repository so that the web and phone
 * builds need no Rust toolchain. Run it after changing scrambler/src (`bun run build:scrambler`); it needs Rust's
 * wasm32-unknown-unknown target (Arch: `pacman -S rust-wasm`, rustup: `rustup target add wasm32-unknown-unknown`).
 */
import { copyFile } from "node:fs/promises";
import { join } from "node:path";

const dir = import.meta.dir;
const cargo = Bun.spawnSync(["cargo", "build", "--release", "--lib", "--target", "wasm32-unknown-unknown"], { cwd: dir, stdout: "inherit", stderr: "inherit" });
if (cargo.exitCode !== 0) throw new Error("cargo build failed (is the wasm32-unknown-unknown target installed?)");
await copyFile(join(dir, "target/wasm32-unknown-unknown/release/scrambler.wasm"), join(dir, "scrambler.wasm"));
console.log(`scrambler/scrambler.wasm: ${((await Bun.file(join(dir, "scrambler.wasm")).arrayBuffer()).byteLength / 1024).toFixed(0)} KB`);
