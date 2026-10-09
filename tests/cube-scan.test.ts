import { describe, expect, test } from "bun:test";
import { applyAlg, FACES, slotsFor, solved, type Face } from "../src/shared/cube";
import { HELD_HEX } from "../src/shared/cubeAppearance";
import { cubeSamples, lab8, readCube, readFace, REFS, resolve, SCAN_FACES, scanColour, scanProblem, type Rgb } from "../src/client/lib/cubeScan";
import { colours } from "../src/client/lib/solveAnalysis";

/** A seeded generator, 0 to 1. */
function random(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

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

/** The lab's colours (rubik.py) are BGR: turned to RGB. */
const bgr = ([b, g, r]: Rgb): Rgb => [r, g, b];

describe("face by face, as the lab reads", () => {
  test("Lab as OpenCV gives it on 8 bits", () => {
    expect(lab8([255, 255, 255])).toEqual([255, 128, 128]);
    expect(lab8([0, 0, 0])).toEqual([0, 128, 128]);
    // cv2.cvtColor(np.uint8([[[40, 210, 220]]]), cv2.COLOR_BGR2LAB), the lab's yellow, then its warm white, a blue.
    expect(lab8(bgr([40, 210, 220]))).toEqual([211, 114, 205]);
    expect(lab8(bgr([94, 175, 221]))).toEqual([189, 135, 175]);
    expect(lab8(bgr([170, 80, 20]))).toEqual([91, 145, 75]);
  });

  test("the lab's colours: shadowed yellows, a warm camera's beige whites, a dark blue", () => {
    for (const face of FACES) expect(scanColour(REFS[face])).toBe(face);
    for (const yellow of [[0, 151, 202], [0, 155, 206], [0, 162, 213]] as Rgb[]) expect(scanColour(bgr(yellow))).toBe("U");
    for (const beige of [[103, 155, 188], [99, 158, 192], [90, 141, 169], [94, 175, 221]] as Rgb[]) expect(scanColour(bgr(beige), { ...REFS, U: bgr([0, 159, 195]) })).toBe("D");
    expect(scanColour(bgr([120, 90, 40]))).toBe("B");
    // Once white is read, pale and bright is no longer white by itself.
    expect(scanColour(bgr([90, 141, 169]), { ...REFS, D: [250, 250, 250], U: bgr([0, 159, 195]) })).toBe("U");
  });

  test("the resolve of a warm camera, an edge flipped: exactly the cube", () => {
    const warm: Record<Face, Rgb> = { D: bgr([94, 175, 221]), U: bgr([0, 160, 215]), L: bgr([10, 40, 200]), R: bgr([0, 100, 240]), B: bgr([120, 90, 40]), F: bgr([30, 160, 80]) };
    const truth = colours(solved(3)),
      // U7 and F1 (the UF edge) swapped.
      flipped = truth.map((c, i) => (i === 7 ? "F" : i === 19 ? "U" : c)) as Face[];
    for (let seed = 1; seed <= 20; seed++) {
      const r = random(seed),
        samples = flipped.map((c) => warm[c].map((v) => Math.min(255, Math.max(0, Math.round(v + (r() - 0.5) * 24)))) as unknown as Rgb);
      expect(resolve(samples), `seed ${seed}`).toEqual(flipped);
    }
  });

  /** A face in the aiming square (240 pixels, a cell 80): stickers on dark plastic, a logo darkening the centre's middle. */
  function picture(cells: Rgb[], seed: number) {
    const r = random(seed),
      rgba = new Uint8ClampedArray(240 * 240 * 4);
    for (let y = 0; y < 240; y++)
      for (let x = 0; x < 240; x++) {
        const [fx, fy] = [(x % 80) / 80, (y % 80) / 80],
          k = Math.floor(y / 80) * 3 + Math.floor(x / 80),
          gap = fx < 0.07 || fx > 0.93 || fy < 0.07 || fy > 0.93,
          logo = k === 4 && Math.hypot(fx - 0.5, fy - 0.5) < 0.3;
        const colour = gap ? [18, 18, 20] : logo ? [30, 30, 35] : cells[k]!;
        for (let c = 0; c < 3; c++) rgba[(y * 240 + x) * 4 + c] = colour[c]! + (r() - 0.5) * 20;
        rgba[(y * 240 + x) * 4 + 3] = 255;
      }
    return rgba;
  }

  test("each face held any way round, read on its lattice, gives back the cube, a logo on every centre", () => {
    const slots = slotsFor(3),
      normal = (f: Face) => slots[FACES.indexOf(f) * 9 + 4]!.n,
      cross = (a: readonly number[], b: readonly number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!],
      // The face on top as the lab's instructions held each face (green at the bottom for yellow, green on top for
      // white), from which each face is then turned a different way.
      top: Record<Face, number[]> = { U: normal("B").slice(), D: normal("F").slice(), F: normal("U").slice(), B: normal("U").slice(), R: normal("U").slice(), L: normal("U").slice() };
    const light: Record<Face, Rgb> = { U: [235, 220, 60], D: [225, 220, 205], F: [40, 170, 80], B: [40, 90, 200], R: [245, 120, 40], L: [200, 40, 45] };
    for (let seed = 1; seed <= 10; seed++) {
      const truth = scrambled(seed);
      const faces = SCAN_FACES.map((face, f) => {
        // The camera looks at the face from outside: its right is the top crossed with the face's normal.
        const n = normal(face),
          up = top[face],
          right = cross(up, n);
        let seen = Array.from({ length: 9 }, (_, k) => {
          const [row, col] = [Math.floor(k / 3), k % 3],
            p = [0, 1, 2].map((a) => n[a]! + right[a]! * (col - 1) + up[a]! * (1 - row)),
            slot = slots.findIndex((s) => s.n.join() === n.join() && s.p.join() === p.join());
          return light[truth[slot]!];
        });
        for (let turn = 0; turn < (seed + f) % 4; turn++) seen = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => seen[(2 - c) * 3 + r]!));
        return readFace(picture(seen, seed * 10 + f), 240, 240, [120, 120], [80, 0], [0, 80]);
      });
      expect(resolve(cubeSamples(faces)), `seed ${seed}`).toEqual(truth);
    }
  });
});
