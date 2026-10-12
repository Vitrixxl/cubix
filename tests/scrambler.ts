import { wasmScrambleEngine } from "../src/client/lib/wasmScrambleEngine";

/** The scrambler the apps run, loaded from the repository. */
export const scrambler = wasmScrambleEngine(() => Bun.file(new URL("../scrambler/scrambler.wasm", import.meta.url)).arrayBuffer());
