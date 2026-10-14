import { describe, expect, test } from "bun:test";
import { applyAlg, FACES, slotsFor, solved, type Face } from "../src/shared/cube";
import { REAL_HELD_HEX as HELD_HEX } from "../src/shared/cubeAppearance";
import { cubeSamples, readCube, readFace, resolve, SCAN_FACES, scanColours, scanProblem, type Rgb } from "../src/client/lib/cubeScan";
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
  /** The stickers of each face, held as the scan asks, as a camera shows them; the colours read live face by face. */
  function scanLive(truth: Face[], look: (face: Face, k: number) => Rgb) {
    const faces: (Rgb[] | null)[] = SCAN_FACES.map(() => null);
    let wrong = 0;
    SCAN_FACES.forEach((face, i) => {
      const at = FACES.indexOf(face) * 9,
        held = truth.slice(at, at + 9).map((c, k) => look(c, at + k));
      wrong += scanColours(faces, { colours: held, face }).held!.filter((c, k) => c !== truth[at + k]).length;
      faces[i] = held;
    });
    return { wrong, faces: faces as Rgb[][] };
  }

  test("live, face by face, under a warm light, a washed-out webcam and an even one: nearly every sticker right, then the whole cube", () => {
    const linear = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4),
      srgb = (v: number) => Math.round(255 * Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
    // ~/dev/lab/scan/live.ts's cameras: a warm one turns white beige, a washed-out one greys every colour.
    const cameras: Record<string, (c: number[]) => Rgb> = {
      even: (c) => c.map((v) => srgb(v * 0.85)) as unknown as Rgb,
      "washed out": (c) => c.map((v) => Math.round(srgb(v * 0.9) * 0.55 + 200 * 0.45)) as unknown as Rgb,
      warm: (c) => c.map((v, k) => srgb(v * [0.95, 0.62, 0.22][k]!)) as unknown as Rgb,
    };
    for (const [name, camera] of Object.entries(cameras)) {
      let wrong = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const truth = scrambled(seed),
          read = scanLive(truth, (c) => camera(hex(c).map(linear)));
        wrong += read.wrong;
        expect(readCube(cubeSamples(read.faces)).colours, `${name} seed ${seed}`).toEqual(truth);
      }
      expect(wrong / 10, name).toBeLessThan(2.5);
    }
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

  test("a phone that saturates: red, orange and yellow told apart by their hue, live and read whole", () => {
    // DroidCam on a phone (~/dev/lab/scan): channels at 255 or 0.
    const look: Record<Face, Rgb[]> = { U: [[255, 255, 0], [255, 254, 32]], R: [[255, 212, 0], [255, 157, 9], [255, 176, 0]], L: [[255, 50, 33], [255, 71, 25]], D: [[255, 255, 255], [255, 255, 254]], B: [[0, 125, 255], [29, 111, 216]], F: [[0, 225, 57], [0, 214, 46]] };
    // Live, its darkest orange (20°) sometimes nearer red (2°) than the orange read so far (40°): the cube read whole
    // puts it right.
    let wrong = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const truth = scrambled(seed),
        r = random(seed);
      wrong += scanLive(truth, (c) => look[c][Math.floor(r() * look[c].length)]!).wrong;
    }
    expect(wrong).toBeLessThanOrEqual(5);
    for (let seed = 1; seed <= 10; seed++) {
      const truth = scrambled(seed),
        r = random(seed);
      expect(readCube(truth.map((c) => look[c][Math.floor(r() * look[c].length)]!)).colours, `seed ${seed}`).toEqual(truth);
    }
  });

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
