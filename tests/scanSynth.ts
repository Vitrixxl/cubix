/**
 * Webcam frames of a scrambled 3×3, made up from a seed, to measure how well the cube is read: random cubes of
 * several makes (black plastic between stickers, or none), each face under its own light (colour temperature,
 * exposure, falloff), clipped, gamma-encoded and noisy, with a logo on the centres, a glint on some stickers, turned,
 * tilted, blurred, over a cluttered background, sometimes with a sliver of the top face above it.
 */
import { applyAlg, solved, type Face } from "../src/shared/cube";
import { colours } from "../src/client/lib/solveAnalysis";

export const SIZE = 160;
type V3 = [number, number, number];

export function random(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
/** Gaussian noise, drawn once (the frames' noise needs to be quick, not perfect). */
const NOISE = (() => {
  const r = random(99);
  return Float32Array.from({ length: 1 << 16 }, () => gauss(r));
})();
const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** Sticker colours of real cubes (sRGB): a few makes, from dull to bright, red and orange or white and yellow close. */
const MAKES: Record<Face, V3[]> = {
  U: [[255, 213, 0], [245, 235, 40], [255, 200, 20], [230, 225, 60]],
  D: [[240, 240, 235], [250, 245, 225], [225, 230, 230], [235, 235, 220]],
  F: [[0, 155, 72], [40, 200, 60], [20, 170, 110], [70, 190, 40]],
  B: [[0, 70, 173], [20, 100, 220], [10, 80, 200], [30, 120, 230]],
  R: [[255, 88, 0], [255, 130, 0], [250, 110, 20], [255, 100, 40]],
  L: [[183, 18, 52], [220, 30, 30], [200, 20, 30], [230, 40, 50]],
};

/** A black body's colour in linear RGB, green 1 (Tanner Helland's fit). */
function kelvin(k: number): V3 {
  const t = k / 100,
    c = (v: number) => Math.max(0, Math.min(255, v));
  const r = t <= 66 ? 255 : c(329.698727446 * (t - 60) ** -0.1332047592),
    g = t <= 66 ? c(99.4708025861 * Math.log(t) - 161.1195681661) : c(288.1221695283 * (t - 60) ** -0.0755148492),
    b = t >= 66 ? 255 : t <= 19 ? 0 : c(138.5177312231 * Math.log(t - 10) - 305.0447927307);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  return [R / G, 1, B / G];
}

/** The homography taking the unit square's corners (0,0) (1,0) (1,1) (0,1) to `q`. */
function homography(q: [number, number][]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q as [[number, number], [number, number], [number, number], [number, number]];
  const dx1 = x1 - x2,
    dx2 = x3 - x2,
    sx = x0 - x1 + x2 - x3,
    dy1 = y1 - y2,
    dy2 = y3 - y2,
    sy = y0 - y1 + y2 - y3,
    det = dx1 * dy2 - dx2 * dy1,
    g = (sx * dy2 - dx2 * sy) / det,
    h = (dx1 * sy - sx * dy1) / det;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
/** The inverse of a 3×3 matrix (row by row). */
function invert(m: number[]) {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h,
    B = -(d * i - f * g),
    C = d * h - e * g,
    det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

export interface Synthetic {
  truth: Face[];
  /** Per face in Cubix's order (U, D, F, B, R, L), a few consecutive frames (RGBA, SIZE a side). */
  frames: Uint8ClampedArray[][];
  stickerless: boolean;
}

/**
 * A random cube and its frames. Its centres' logo: a ring, dark on white, a shade off elsewhere; or (`hex`) a filled
 * dark blue hexagon over the middle, half the sticker wide, on the yellow and white centres (as some cubes have).
 */
export function syntheticCube(seed: number, framesPerFace = 6, logo: "ring" | "hex" = "ring"): Synthetic {
  const r = random(seed * 7919 + 13);
  const turns: string[] = [];
  while (turns.length < 25) {
    const face = "UDFBRL"[Math.floor(r() * 6)]!;
    if (turns.at(-1)?.[0] !== face) turns.push(face + ["", "'", "2"][Math.floor(r() * 3)]);
  }
  const truth = colours(applyAlg(solved(3), turns.join(" ")));
  const stickerless = r() < 0.35,
    make = Object.fromEntries(
      (Object.keys(MAKES) as Face[]).map((f) => {
        const base = MAKES[f][Math.floor(r() * MAKES[f].length)]!;
        return [f, base.map((v) => lin(Math.max(0, Math.min(255, v + gauss(r) * 6))) * 0.92) as V3];
      }),
    ) as Record<Face, V3>,
    body: V3 = stickerless ? [0, 0, 0] : r() < 0.8 ? [0.006, 0.006, 0.007] : [0.6, 0.6, 0.62],
    gap = stickerless ? r() * 0.035 : 0.06 + r() * 0.1,
    corner = r() * 0.25,
    camera = kelvin(5500),
    logoAll = r() < 0.3;
  const frames = [0, 1, 2, 3, 4, 5].map((f) => {
    const cells = truth.slice(f * 9, f * 9 + 9),
      temp = kelvin(2700 + r() * 4300),
      light = temp.map((v, k) => (v / camera[k]!) * (0.6 + r() * 0.9)) as V3,
      falloff = [gauss(r) * 0.15, gauss(r) * 0.15],
      side = SIZE * (0.36 + r() * 0.28),
      angle = (r() - 0.5) * 0.8,
      // Wholly in the picture, turned and tilted.
      room = SIZE / 2 - (side / 2) * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle))) * 1.1 - 3,
      cx = SIZE / 2 + (r() - 0.5) * 2 * Math.max(0, room),
      cy = SIZE / 2 + (r() - 0.5) * 2 * Math.max(0, room),
      corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => {
        const px = x! * side + gauss(r) * side * 0.03,
          py = y! * side + gauss(r) * side * 0.03;
        return [cx + px * Math.cos(angle) - py * Math.sin(angle), cy + px * Math.sin(angle) + py * Math.cos(angle)] as [number, number];
      }),
      back = invert(homography(corners)),
      glint = r() < 0.5 ? { x: (Math.floor(r() * 3) + 0.2 + r() * 0.6) / 3, y: (Math.floor(r() * 3) + 0.2 + r() * 0.6) / 3, s: 0.025 + r() * 0.045, k: 0.5 + r() * 1.5 } : null,
      sliver = r() < 0.5 ? Array.from({ length: 3 }, () => make[(["U", "D", "F", "B", "R", "L"] as Face[])[Math.floor(r() * 6)]!]) : null,
      clutter = Array.from({ length: 6 + Math.floor(r() * 8) }, () => ({
        x: r() * SIZE,
        y: r() * SIZE,
        w: 8 + r() * 60,
        h: 8 + r() * 60,
        c: [r() * 0.6, r() * 0.6, r() * 0.6] as V3,
      })),
      wall: V3 = [0.1 + r() * 0.3, 0.1 + r() * 0.3, 0.1 + r() * 0.3],
      gamma = 1 / (2.2 + (r() - 0.5) * 0.3),
      noise = 2 + r() * 6,
      blur = r() < 0.5;
    // The scene in linear light, before the camera.
    const scene = (X: number, Y: number): V3 => {
      const w = back[6]! * X + back[7]! * Y + back[8]!,
        u = (back[0]! * X + back[1]! * Y + back[2]!) / w,
        v = (back[3]! * X + back[4]! * Y + back[5]!) / w;
      let c: V3 = wall;
      for (const k of clutter) if (X >= k.x && X < k.x + k.w && Y >= k.y && Y < k.y + k.h) c = k.c;
      if (sliver && u >= 0 && u < 1 && v >= -0.16 && v < 0) {
        const col = Math.floor(u * 3),
          fu = (u * 3) % 1;
        c = fu > gap && fu < 1 - gap && v > -0.14 && v < -0.02 ? sliver[col]!.map((t) => t * 0.55) as V3 : body;
      }
      if (u >= 0 && u < 1 && v >= 0 && v < 1) {
        const i = Math.floor(u * 3),
          j = Math.floor(v * 3),
          fu = (u * 3) % 1,
          fv = (v * 3) % 1,
          // The sticker, its corners rounded.
          du = Math.max(0, Math.abs(fu - 0.5) - (0.5 - gap / 2 - corner)),
          dv = Math.max(0, Math.abs(fv - 0.5) - (0.5 - gap / 2 - corner)),
          inside = Math.abs(fu - 0.5) < 0.5 - gap / 2 && Math.abs(fv - 0.5) < 0.5 - gap / 2 && Math.hypot(du, dv) < corner + 1e-9;
        const face = cells[j * 3 + i]!;
        c = inside ? make[face] : stickerless ? make[face].map((t) => t * 0.35) as V3 : body;
        if (inside && i === 1 && j === 1 && logo === "ring" && (face === "D" || logoAll)) {
          const d = Math.hypot(fu - 0.5, fv - 0.5);
          if (d > 0.14 && d < 0.26) c = face === "D" ? [0.05, 0.05, 0.06] : c.map((t) => t * 0.6) as V3;
        }
        if (inside && i === 1 && j === 1 && logo === "hex" && (face === "D" || face === "U" || logoAll)) {
          const [x, y] = [Math.abs(fu - 0.5), Math.abs(fv - 0.5)];
          if (y < 0.22 * 0.866 && 1.732 * x + y < 1.732 * 0.22) c = [0.01, 0.03, 0.22];
        }
      }
      const shade = 1 + falloff[0]! * (X / SIZE - 0.5) + falloff[1]! * (Y / SIZE - 0.5);
      let out = c.map((t, k) => t * light[k]! * shade) as V3;
      if (glint && u >= 0 && u < 1 && v >= 0 && v < 1) {
        const g = glint.k * Math.exp(-((u - glint.x) ** 2 + (v - glint.y) ** 2) / (2 * glint.s * glint.s));
        out = out.map((t) => t + g) as V3;
      }
      return out;
    };
    // Each pixel the average of two samples, then the camera's curve.
    const base = new Float32Array(SIZE * SIZE * 3);
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const sum = [0, 0, 0];
        for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.75]] as const) {
          const c = scene(x + ox, y + oy);
          for (let k = 0; k < 3; k++) sum[k]! += c[k]!;
        }
        for (let k = 0; k < 3; k++) base[(y * SIZE + x) * 3 + k] = 255 * Math.min(1, sum[k]! / 2) ** gamma;
      }
    if (blur) {
      const copy = base.slice();
      for (let y = 1; y < SIZE - 1; y++)
        for (let x = 1; x < SIZE - 1; x++)
          for (let k = 0; k < 3; k++) {
            let s = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += copy[((y + dy) * SIZE + x + dx) * 3 + k]! * (dx || dy ? (dx && dy ? 1 : 2) : 4);
            base[(y * SIZE + x) * 3 + k] = s / 16;
          }
    }
    return Array.from({ length: framesPerFace }, () => {
      const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
      let at = Math.floor(r() * 65536);
      for (let p = 0; p < SIZE * SIZE; p++) {
        for (let k = 0; k < 3; k++) rgba[p * 4 + k] = base[p * 3 + k]! + NOISE[(at = (at * 75 + 74) % 65537) & 65535]! * noise;
        rgba[p * 4 + 3] = 255;
      }
      return rgba;
    });
  });
  return { truth, frames, stickerless };
}
