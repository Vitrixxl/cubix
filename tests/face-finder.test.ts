import { describe, expect, test } from "bun:test";
import { findFace, readFace } from "../src/client/lib/faceFinder";
import { liveColours, type Rgb } from "../src/client/lib/cubeScan";

/** Colours as a webcam gives them under a warm light. */
const PALETTE: Rgb[] = [[235, 220, 60], [225, 220, 205], [40, 170, 80], [40, 90, 200], [245, 120, 40], [200, 40, 45]];
const SIZE = 160;

/**
 * A picture of a face: a textured, unevenly lit background, the face turned `angle`, `side` pixels wide, at
 * (`cx`, `cy`); the stickers `gap` apart on dark plastic, each with noise.
 */
function picture(cells: number[], { angle = 0, side = 70, cx = 80, cy = 80, gap = 0.12, seed = 1, logo = false } = {}) {
  let s = seed;
  const random = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4),
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const lx = ((x - cx) * cos + (y - cy) * sin) / side + 0.5,
        ly = (-(x - cx) * sin + (y - cy) * cos) / side + 0.5,
        light = 0.75 + 0.35 * (x / SIZE);
      let colour: number[] = [90 + 40 * Math.sin(x / 7) * Math.cos(y / 9), 80 + 30 * Math.sin(y / 5), 70];
      if (lx >= 0 && lx < 1 && ly >= 0 && ly < 1) {
        const fx = (lx * 3) % 1,
          fy = (ly * 3) % 1,
          inside = fx > gap / 2 && fx < 1 - gap / 2 && fy > gap / 2 && fy < 1 - gap / 2;
        colour = inside ? [...PALETTE[cells[Math.floor(ly * 3) * 3 + Math.floor(lx * 3)]!]!] : [20, 20, 22];
        // A blue hexagon over the middle of the centre, most of the sticker wide.
        const [hx, hy] = [Math.abs(lx * 3 - 1.5), Math.abs(ly * 3 - 1.5)];
        if (logo && hy < 0.3 * 0.866 && 1.732 * hx + hy < 1.732 * 0.3) colour = [40, 90, 200];
      }
      for (let k = 0; k < 3; k++) rgba[(y * SIZE + x) * 4 + k] = colour[k]! * light + (random() - 0.5) * 24;
      rgba[(y * SIZE + x) * 4 + 3] = 255;
    }
  return rgba;
}
const nearest = (c: Rgb) => PALETTE.map((p, i) => [Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]), i] as const).sort((a, b) => a[0] - b[0])[0]![1];

describe("face finder", () => {
  test("reads the nine stickers wherever the face stands, turned, of any size", () => {
    let seed = 5;
    const cases = [
      { angle: 0, side: 70, cx: 80, cy: 80 },
      { angle: 0.3, side: 60, cx: 60, cy: 90 },
      { angle: -0.5, side: 80, cx: 90, cy: 75 },
      { angle: 0.7, side: 50, cx: 100, cy: 60 },
      { angle: 0.15, side: 95, cx: 80, cy: 82, gap: 0.06 },
    ];
    for (const options of cases) {
      const cells = Array.from({ length: 9 }, (_, i) => (i * 7 + seed++) % 6);
      const face = findFace(picture(cells, { ...options, seed }), SIZE, SIZE);
      expect(face, JSON.stringify(options)).not.toBeNull();
      expect(face!.colours.map(nearest), JSON.stringify(options)).toEqual(cells);
    }
  });

  test("a solved face, its stickers touching, is found from the lattice alone when they stand apart", () => {
    const cells = [0, 0, 1, 0, 0, 1, 2, 2, 2];
    const face = findFace(picture(cells, { angle: 0.2 }), SIZE, SIZE);
    expect(face!.colours.map(nearest)).toEqual(cells);
  });

  test("a centre with a big logo in its middle reads as its colour, found or on the guide", () => {
    const cells = [2, 3, 4, 5, 0, 1, 2, 3, 4];
    const rgba = picture(cells, { logo: true });
    expect(findFace(rgba, SIZE, SIZE)!.colours.map(nearest)).toEqual(cells);
    const read = readFace(rgba, SIZE, SIZE, [80, 80], [70 / 3, 0], [0, 70 / 3]);
    expect(read.map(nearest)).toEqual(cells);
    // The live preview: yellow asked for, its own centre the yellow look.
    expect(liveColours(read, { U: read[4] })[4]).toBe("U");
  });

  test("finds nothing where there is no cube", () => {
    expect(findFace(picture([], { cx: -500 }), SIZE, SIZE)).toBeNull();
  });

  test("takes a few milliseconds", () => {
    const rgba = picture([0, 1, 2, 3, 4, 5, 0, 1, 2], { angle: 0.3 });
    for (let i = 0; i < 20; i++) findFace(rgba, SIZE, SIZE);
    const start = performance.now();
    for (let i = 0; i < 50; i++) findFace(rgba, SIZE, SIZE);
    const each = (performance.now() - start) / 50;
    console.log(`findFace: ${each.toFixed(2)} ms`);
    expect(each).toBeLessThan(10);
  });
});
