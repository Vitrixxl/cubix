import { describe, expect, test } from "bun:test";
import { applyAlg, solved, type Face } from "../src/shared/cube";
import { HELD_HEX } from "../src/shared/cubeAppearance";
import { readCube, scanProblem, type Rgb } from "../src/client/lib/cubeScan";
import { FaceReader, findFace } from "../src/client/lib/faceFinder";
import { colours } from "../src/client/lib/solveAnalysis";
import { random, SIZE, syntheticCube } from "./scanSynth";

const hex = (face: Face): Rgb => [HELD_HEX[face] >> 16, (HELD_HEX[face] >> 8) & 255, HELD_HEX[face] & 255];
function scrambled(seed: number) {
  const r = random(seed),
    turns: string[] = [];
  while (turns.length < 25) {
    const face = "UDFBRL"[Math.floor(r() * 6)]!;
    if (turns.at(-1)?.[0] !== face) turns.push(face + ["", "'", "2"][Math.floor(r() * 3)]);
  }
  return colours(applyAlg(solved(3), turns.join(" ")));
}

describe("cube read", () => {
  test("clean colours give back the cube, sure of every sticker", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const truth = scrambled(seed),
        read = readCube(truth.map(hex));
      expect(read.colours).toEqual(truth);
      expect(Math.min(...read.confidence)).toBeGreaterThan(0.8);
    }
  });

  test("each face under its own light, a glint and a wrong centre: the pieces put the colours right", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const truth = scrambled(seed),
        r = random(seed + 100),
        light = [0, 1, 2, 3, 4, 5].map(() => [0.6 + r() * 0.6, 0.6 + r() * 0.5, 0.4 + r() * 0.7]),
        samples = truth.map((face, i) => hex(face).map((v, k) => Math.min(255, v * light[Math.floor(i / 9)]![k]! + (r() - 0.5) * 16)) as unknown as Rgb);
      // A sticker gone white with a glint, a centre with a logo.
      const glint = 9 * Math.floor(r() * 6) + [0, 1, 2, 3, 5, 6, 7, 8][Math.floor(r() * 8)]!;
      samples[glint] = [250, 250, 245];
      samples[4] = [140, 130, 110];
      const read = readCube(samples);
      expect(read.colours, `seed ${seed}`).toEqual(truth);
      expect(scanProblem(read.colours)).toBeNull();
    }
  });

  test("colours of no real cube still give one that can be solved, its doubtful stickers said", () => {
    const truth = colours(solved(3));
    // A twisted corner: U0, B2 and L0 turned a third.
    const twisted = truth.map((v, i) => (i === 0 ? "L" : i === 45 ? "B" : i === 29 ? "U" : v)) as Face[];
    expect(scanProblem(twisted)).not.toBeNull();
    const read = readCube(twisted.map(hex));
    expect(scanProblem(read.colours)).toBeNull();
    expect(read.confidence.filter((c) => c < 0.8).length).toBeGreaterThan(0);
  });
});

/**
 * Frames made up from a seed (tests/scanSynth.ts), each face read over its frames, then the cube decided. A few cubes
 * here; `SCAN_BENCH=300 bun test tests/cube-scan.test.ts` measures many.
 */
test("reads synthetic webcam frames", () => {
  const n = Number(process.env.SCAN_BENCH ?? 4);
  let full = 0,
    right = 0,
    lost = 0,
    decide = 0;
  for (let seed = 1; seed <= n; seed++) {
    const { truth, frames } = syntheticCube(seed, 16, process.env.SCAN_LOGO === "hex" ? "hex" : "ring");
    const faces = frames.map((fs) => {
      const reader = new FaceReader();
      let read: Rgb[] | null = null;
      for (const frame of fs) read = reader.push(findFace(frame, SIZE, SIZE)) ?? read;
      return read;
    });
    if (faces.some((f) => !f)) {
      lost++;
      continue;
    }
    const start = performance.now(),
      cube = readCube(faces.flat() as Rgb[]);
    decide += performance.now() - start;
    const ok = cube.colours.filter((c, i) => c === truth[i]).length;
    right += ok;
    if (ok === 54) full++;
  }
  const read = n - lost;
  console.log(
    `scan: ${n} cubes, ${lost} with a face not found; of ${read} read, ${((100 * full) / read).toFixed(1)}% right in full, ` +
      `${((100 * right) / read / 54).toFixed(2)}% of stickers, ${(decide / read).toFixed(1)} ms to decide`,
  );
  expect(full).toBeGreaterThanOrEqual(read - 1);
  expect(lost).toBeLessThanOrEqual(Math.ceil(n / 5));
}, 120_000);
