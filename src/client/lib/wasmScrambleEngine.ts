import type { ScrambleEngine } from "./practiceScrambleCore";
import type { PatternData } from "../../shared/crossTraining";

/** What scrambler/scrambler.wasm exports (scrambler/src/lib.rs). */
interface Exports {
  memory: WebAssembly.Memory;
  io(): number;
  seed(a: number, b: number): void;
  warm(): void;
  scramble_event(length: number): number;
  scramble_orbit(corners: number): number;
  scramble_pattern(): number;
}

/**
 * The app's scrambler, built from Rust to WebAssembly (scrambler/): random-state 2×2, 3×3, Pyraminx and Skewb, random
 * moves for the larger puzzles, all on the device. `load` gives the module's bytes, asked for once, at the first
 * scramble or at `warm()`. Every call runs at once on the caller's thread: a few milliseconds at most.
 */
export function wasmScrambleEngine(load: () => Promise<BufferSource>): ScrambleEngine & { warm(): Promise<void> } {
  let ready: Promise<Exports> | undefined;
  const scrambler = () =>
    (ready ??= load()
      .then(bytes => WebAssembly.compile(bytes))
      .then(module => WebAssembly.instantiate(module, {}))
      .then(instance => {
        const wasm = instance.exports as unknown as Exports;
        reseed(wasm);
        return wasm;
      })
      .catch(error => {
        ready = undefined;
        throw error;
      }));
  const reseed = (wasm: Exports) => {
    const seed = crypto.getRandomValues(new Uint32Array(2));
    wasm.seed(seed[0]!, seed[1]!);
  };
  const io = (wasm: Exports, length: number) => new Uint8Array(wasm.memory.buffer, wasm.io(), length);
  // The calls return the scramble's length, -1 for an error.
  const answer = (wasm: Exports, length: number, what: string) => {
    if (length < 0) throw new Error(`No scramble for ${what}.`);
    return new TextDecoder().decode(io(wasm, length));
  };
  return {
    async warm() {
      (await scrambler()).warm();
    },
    async randomScrambleForEvent(event) {
      const wasm = await scrambler(), name = new TextEncoder().encode(event);
      io(wasm, name.length).set(name);
      return answer(wasm, wasm.scramble_event(name.length), event);
    },
    // Seeded for this one scramble, then random again: the scrambles after it stay unforeseeable.
    async seededScramble(event, [a, b]) {
      const wasm = await scrambler(), name = new TextEncoder().encode(event);
      wasm.seed(a >>> 0, b >>> 0);
      io(wasm, name.length).set(name);
      try {
        return answer(wasm, wasm.scramble_event(name.length), event);
      } finally {
        reseed(wasm);
      }
    },
    async orbitScramble(orbit) {
      const wasm = await scrambler();
      return answer(wasm, wasm.scramble_orbit(orbit === "CORNERS" ? 1 : 0), orbit);
    },
    async patternScramble(pattern: PatternData) {
      const wasm = await scrambler();
      io(wasm, 40).set([...pattern.EDGES.pieces, ...pattern.EDGES.orientation, ...pattern.CORNERS.pieces, ...pattern.CORNERS.orientation]);
      return answer(wasm, wasm.scramble_pattern(), "this pattern");
    },
  };
}
