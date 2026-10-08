/**
 * Finds a face of a cube in a small camera picture (RGBA, 160 pixels a side is plenty) and reads its nine colours, in
 * a couple of milliseconds and without a model: the stickers are the flat patches between the picture's edges, and a
 * face is nine of them on a 3×3 lattice, wherever the face stands in the picture, however large and a little turned.
 *
 * Each colour is read from the middle of its sticker only, leaving out what is not the sticker's own colour: the dark
 * of a gap, a shadow or a logo, the white of a glint. `FaceReader` then keeps a face held still over a few frames and
 * gives each sticker its median colour across them.
 */
import type { Rgb } from "./cubeScan";

type Point = [number, number];
export interface FoundFace {
  /** The centre sticker, and the steps to the next column (`u`, to the right) and the next row (`v`, down), in pixels. */
  centre: Point;
  u: Point;
  v: Point;
  /** Row by row, as the picture shows the face. */
  colours: Rgb[];
  /** How many of the nine stickers stood apart; the others were read where the lattice puts them. */
  seen: number;
}

interface Patch {
  x: number;
  y: number;
  area: number;
  /** Its bounding box: left, top, right, bottom. */
  box: [number, number, number, number];
  /** Its second moments: xx, yy, xy. */
  spread: [number, number, number];
  /** Shaped and sized like one sticker. */
  sticker: boolean;
}

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[sorted.length >> 1]!;
};

/**
 * The colour of a sticker: the middle of its cell (`size` of the lattice step across) taken at 8×8 points, without the
 * dark ones (gap, shadow, logo) nor the glint (brighter and greyer than the sticker), the median of each channel.
 */
export function readCell(rgba: ArrayLike<number>, w: number, h: number, [cx, cy]: Point, u: Point, v: Point, size = 0.56): Rgb {
  const r: number[] = [],
    g: number[] = [],
    b: number[] = [];
  for (let j = 0; j < 8; j++)
    for (let i = 0; i < 8; i++) {
      const s = ((i + 0.5) / 8 - 0.5) * size,
        t = ((j + 0.5) / 8 - 0.5) * size,
        x = Math.round(cx + s * u[0] + t * v[0]),
        y = Math.round(cy + s * u[1] + t * v[1]);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const k = (y * w + x) * 4;
      r.push(rgba[k]!);
      g.push(rgba[k + 1]!);
      b.push(rgba[k + 2]!);
    }
  if (!r.length) return [0, 0, 0];
  const value = r.map((_, i) => Math.max(r[i]!, g[i]!, b[i]!)),
    saturation = r.map((_, i) => (value[i]! - Math.min(r[i]!, g[i]!, b[i]!)) / (value[i]! || 1)),
    rank = (values: number[], q: number) => values.slice().sort((p, q) => p - q)[Math.floor(q * (values.length - 1))]!,
    bright = rank(value, 0.75),
    middle = rank(value, 0.5),
    vivid = rank(saturation, 0.75);
  const keep = r.flatMap((_, i) => (value[i]! < 0.5 * bright || (value[i]! > middle && saturation[i]! < 0.6 * vivid) ? [] : [i]));
  const from = keep.length >= 4 ? keep : r.map((_, i) => i);
  return [median(from.map((i) => r[i]!)), median(from.map((i) => g[i]!)), median(from.map((i) => b[i]!))];
}

/**
 * The flat patches of the picture: the regions its edges close (`label`, pixel by pixel; -1 on an edge). The edges are
 * taken on the picture softened a little, so that a noisy camera does not break a sticker into crumbs, and where the
 * gradient passes `bar` times the picture's typical one.
 */
function patches(rgba: ArrayLike<number>, w: number, h: number, bar = 3.5): { all: Patch[]; label: Int32Array } {
  const n = w * h,
    W = w * 3,
    across = new Int32Array(n * 3),
    soft = new Int32Array(n * 3),
    grad = new Float32Array(n).fill(255);
  // A 3×3 box blur (nine times the mean), rows then columns; the frame's border stays an edge.
  for (let y = 0; y < h; y++)
    for (let x = 1; x < w - 1; x++) {
      const p = (y * w + x) * 4,
        q = (y * w + x) * 3;
      across[q] = rgba[p - 4]! + rgba[p]! + rgba[p + 4]!;
      across[q + 1] = rgba[p - 3]! + rgba[p + 1]! + rgba[p + 5]!;
      across[q + 2] = rgba[p - 2]! + rgba[p + 2]! + rgba[p + 6]!;
    }
  for (let i = W; i < n * 3 - W; i++) soft[i] = across[i - W]! + across[i]! + across[i + W]!;
  for (let y = 1; y < h - 2; y++)
    for (let x = 1; x < w - 2; x++) {
      const k = (y * w + x) * 3;
      grad[y * w + x] =
        (Math.abs(soft[k]! - soft[k + 3]!) + Math.abs(soft[k + 1]! - soft[k + 4]!) + Math.abs(soft[k + 2]! - soft[k + 5]!) +
          Math.abs(soft[k]! - soft[k + W]!) + Math.abs(soft[k + 1]! - soft[k + W + 1]!) + Math.abs(soft[k + 2]! - soft[k + W + 2]!)) / 9;
    }
  // Edges stand out against the picture's own texture: the typical gradient (most of a picture is flat) sets the bar.
  const counts = new Uint32Array(256);
  for (let k = 0; k < n; k += 7) counts[Math.min(255, grad[k]! | 0)]!++;
  let typical = 0;
  for (let seen = 0, half = Math.ceil(n / 7) / 2; typical < 255 && (seen += counts[typical]!) < half; ) typical++;
  const edge = Math.min(60, Math.max(14, bar * typical)),
    label = new Int32Array(n).fill(-1),
    stack = new Int32Array(n),
    out: Patch[] = [];
  for (let start = 0, id = 0; start < n; start++) {
    if (label[start] !== -1 || grad[start]! > edge) continue;
    let top = 0,
      area = 0,
      sx = 0,
      sy = 0,
      sxx = 0,
      syy = 0,
      sxy = 0,
      x0 = w,
      x1 = 0,
      y0 = h,
      y1 = 0;
    stack[top++] = start;
    label[start] = id;
    while (top) {
      const i = stack[--top]!,
        x = i % w,
        y = (i - x) / w;
      area++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let d = 0; d < 4; d++) {
        const j = d === 0 ? (x > 0 ? i - 1 : -1) : d === 1 ? (x + 1 < w ? i + 1 : -1) : d === 2 ? (y > 0 ? i - w : -1) : y + 1 < h ? i + w : -1;
        if (j < 0 || label[j] !== -1 || grad[j]! > edge) continue;
        label[j] = id;
        stack[top++] = j;
      }
    }
    id++;
    const bw = x1 - x0 + 1,
      bh = y1 - y0 + 1,
      [mx, my] = [sx / area, sy / area];
    out.push({
      x: mx,
      y: my,
      area,
      box: [x0, y0, x1, y1],
      spread: [sxx / area - mx * mx, syy / area - my * my, sxy / area - mx * my],
      // A sticker: a 1/600th to a 1/15th of the picture, square-ish (a tilted square fills half its box).
      sticker: area > n / 600 && area < n / 15 && area > 0.45 * bw * bh && bw < 2 * bh && bh < 2 * bw,
    });
  }
  return { all: out, label };
}

const length = ([x, y]: Point) => Math.hypot(x, y);
/** The nine places of a face, row by row, from its centre. */
const OFFSETS = [-1, 0, 1].flatMap((j) => [-1, 0, 1].map((i) => [i, j] as const));

/** Patches on the lattice: the mean column `i` and row `j` (from the centre) of the stickers each one covers. */
interface Mark {
  i: number;
  j: number;
  x: number;
  y: number;
}

/** A lattice tried: its centre and steps, the patches on it, how many stickers they cover, how well it fits. */
interface Lattice {
  centre: Point;
  u: Point;
  v: Point;
  marks: Mark[];
  seen: number;
  score: number;
}

/** The lattice through the patches seen, by least squares: each is the centre plus its steps along `u` and `v`. */
function refine(marks: Mark[], centre: Point, u: Point, v: Point): [Point, Point, Point] {
  // Normal equations of x = c + i·u + j·v (and the same for y).
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0],
    bx = [0, 0, 0],
    by = [0, 0, 0];
  for (const p of marks) {
    const row = [1, p.i, p.j];
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) m[a * 3 + b]! += row[a]! * row[b]!;
      bx[a]! += row[a]! * p.x;
      by[a]! += row[a]! * p.y;
    }
  }
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number],
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-6) return [centre, u, v];
  const inv = [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d].map((t) => t / det),
    solve = (r: number[]) => [0, 1, 2].map((row) => inv[row * 3]! * r[0]! + inv[row * 3 + 1]! * r[1]! + inv[row * 3 + 2]! * r[2]!);
  const [cx, ux, vx] = solve(bx) as [number, number, number],
    [cy, uy, vy] = solve(by) as [number, number, number];
  return [[cx, cy], [ux, uy], [vx, vy]];
}

/**
 * The face in the picture, or null when no 3×3 lattice holds six stickers or more. A sticker counts when the patch at
 * its place covers it and its neighbours on the lattice only, as large as they are and centred on them: on a cube
 * without black plastic between its stickers, neighbours of one colour make one patch.
 */
export function findFace(rgba: ArrayLike<number>, w: number, h: number): FoundFace | null {
  // Faint edges first (a cube without black plastic); strong ones only, when a noisy picture crumbles the stickers.
  return look(rgba, w, h, 3.5) ?? look(rgba, w, h, 5);
}

function look(rgba: ArrayLike<number>, w: number, h: number, bar: number): FoundFace | null {
  const { all, label } = patches(rgba, w, h, bar),
    stickers = all.filter((p) => p.sticker);
  // Set inside `consider`, out of the flow analysis's sight: hence the cast.
  let best = null as Lattice | null;
  const tried = new Set<string>();
  /** How well a lattice through (`cx`, `cy`) with these steps fits the patches. */
  const consider = (cx: number, cy: number, p: Point, q: Point) => {
    // The step to the right is the one closest to the picture's x axis; the step down then points down.
    const [across, down] = Math.abs(p[0]) >= Math.abs(q[0]) ? [p, q] : [q, p],
      u: Point = across[0] < 0 ? [-across[0], -across[1]] : across,
      v: Point = down[1] < 0 ? [-down[0], -down[1]] : down,
      cell = Math.abs(u[0] * v[1] - u[1] * v[0]),
      reach = 0.3 * Math.min(length(u), length(v)),
      margin = 0.15 * length(u),
      // The same lattice comes from each of its stickers: weighed once.
      key = [cx, cy, ...u, ...v].map((t) => Math.round(t / 2)).join();
    if (tried.has(key)) return;
    tried.add(key);
    // The face's outline, wholly in the picture; no patch may spill out of it.
    const outline = [-1.5, 1.5].flatMap((i) => [-1.5, 1.5].map((j) => [cx + i * u[0] + j * v[0], cy + i * u[1] + j * v[1]])),
      [left, top, right, bottom] = [Math.min(...outline.map((o) => o[0]!)), Math.min(...outline.map((o) => o[1]!)), Math.max(...outline.map((o) => o[0]!)), Math.max(...outline.map((o) => o[1]!))];
    if (left < 0 || top < 0 || right > w || bottom > h) return;
    // The patch under each sticker's middle, then each patch's stickers.
    const under = new Map<number, number[]>();
    OFFSETS.forEach(([i, j], k) => {
      const id = label[Math.round(cy + i * u[1] + j * v[1]) * w + Math.round(cx + i * u[0] + j * v[0])]!;
      if (id >= 0) under.set(id, [...(under.get(id) ?? []), k]);
    });
    let seen = 0,
      sure = 0,
      error = 0;
    const marks: Mark[] = [];
    for (const [id, cells] of under) {
      const patch = all[id]!,
        i = cells.reduce((s, k) => s + OFFSETS[k]![0], 0) / cells.length,
        j = cells.reduce((s, k) => s + OFFSETS[k]![1], 0) / cells.length,
        off = Math.hypot(patch.x - (cx + i * u[0] + j * v[0]), patch.y - (cy + i * u[1] + j * v[1]));
      if (
        patch.area < 0.35 * cells.length * cell ||
        patch.area > 1.2 * cells.length * cell ||
        off > reach ||
        patch.box[0] < left - margin ||
        patch.box[1] < top - margin ||
        patch.box[2] > right + margin ||
        patch.box[3] > bottom + margin
      )
        continue;
      if (cells.length > 1) {
        // Merged stickers spread as their cells do (a patch of the background seldom does).
        const square = (u[0] ** 2 + u[1] ** 2 + v[0] ** 2 + v[1] ** 2) / 12,
          spread = cells.reduce((s, k) => s + square + (OFFSETS[k]![0] - i) ** 2 * (u[0] ** 2 + u[1] ** 2) + (OFFSETS[k]![1] - j) ** 2 * (v[0] ** 2 + v[1] ** 2), 0) / cells.length,
          ratio = (patch.spread[0] + patch.spread[1]) / spread;
        if (ratio < 0.6 || ratio > 1.4) continue;
      }
      seen += cells.length;
      // A sticker standing apart is surer than merged ones.
      sure += cells.length === 1 ? 1 : 0.6 * cells.length;
      error += off / reach;
      marks.push({ i, j, x: patch.x, y: patch.y });
    }
    // The most stickers, those apart first, then the closest to their places.
    const score = sure - 0.01 * error;
    if (marks.length >= 4 && (!best || score > best.score)) best = { centre: [cx, cy], u, v, marks, seen, score };
  };
  for (const a of stickers) {
    const side = Math.sqrt(a.area);
    // Its neighbours on the lattice: a sticker's width plus the gap away, about as large.
    const near = stickers
      .filter((b) => b !== a && b.area > a.area / 2 && b.area < a.area * 2)
      .map((b) => [b.x - a.x, b.y - a.y] as Point)
      .filter((d) => length(d) > 0.9 * side && length(d) < 2.2 * side)
      .sort((p, q) => length(p) - length(q))
      .slice(0, 6);
    // Two steps across; or where merged stickers leave a single neighbour, one step and the square's other side, or
    // the step across the square's diagonal.
    const steps = near.flatMap((p, k): [Point, Point][] => [
      ...near.slice(k + 1).map((q): [Point, Point] => [p, q]),
      [p, [-p[1], p[0]]],
      [[(p[0] - p[1]) / 2, (p[1] + p[0]) / 2], [(-p[1] - p[0]) / 2, (p[0] - p[1]) / 2]],
    ]);
    for (const [p, q] of steps) {
      const ratio = length(q) / length(p),
        cos = (p[0] * q[0] + p[1] * q[1]) / (length(p) * length(q));
      if (ratio < 0.75 || ratio > 1.33 || Math.abs(cos) > 0.35) continue;
      // The patch may be any of the nine (a logo or a glint can hide the centre's own patch).
      for (const [i, j] of OFFSETS) consider(a.x - i * p[0] - j * q[0], a.y - i * p[1] - j * q[1], p, q);
    }
    // Nine stickers right where they should be: nothing will do better.
    if (best && best.score > 8.9) break;
  }
  // Too few stickers stand apart (a cube without black plastic, many neighbours alike): two merged stickers, a patch
  // twice as long as wide, give the steps.
  if (!best || best.seen < 9)
    for (const a of all) {
      const [xx, yy, xy] = a.spread,
        root = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy),
        long = (xx + yy) / 2 + root,
        short = (xx + yy) / 2 - root;
      if (a.area < (w * h) / 300 || a.area > (w * h) / 8 || short <= 0 || long / short < 2.8 || long / short > 5.5) continue;
      const angle = 0.5 * Math.atan2(2 * xy, xx - yy),
        step = Math.sqrt(12 * short),
        p: Point = [step * Math.cos(angle), step * Math.sin(angle)],
        q: Point = [-p[1], p[0]];
      for (const i of [-0.5, 0.5]) for (const j of [-1, 0, 1]) consider(a.x - i * p[0] - j * q[0], a.y - i * p[1] - j * q[1], p, q);
    }
  if (!best || best.seen < 6 || best.score < 5.5) return null;
  const [centre, u, v] = refine(best.marks, best.centre, best.u, best.v);
  const points = OFFSETS.map(([i, j]): Point => [centre[0] + i * u[0] + j * v[0], centre[1] + i * u[1] + j * v[1]]);
  return { centre, u, v, colours: points.map((p) => readCell(rgba, w, h, p, u, v)), seen: best.seen };
}

/** The nine colours read where a lattice stands (a guide drawn on the picture, when no face is found). */
export const readFace = (rgba: ArrayLike<number>, w: number, h: number, centre: Point, u: Point, v: Point): Rgb[] =>
  [-1, 0, 1].flatMap((j) => [-1, 0, 1].map((i) => readCell(rgba, w, h, [centre[0] + i * u[0] + j * v[0], centre[1] + i * u[1] + j * v[1]], u, v)));

/** Frames a face must stay still to be read. */
export const STILL_FRAMES = 8;

/** The same face at the same place: as large, as turned, most of its colours alike. */
const same = (a: FoundFace, b: FoundFace) =>
  length([a.centre[0] - b.centre[0], a.centre[1] - b.centre[1]]) < 0.25 * length(b.u) &&
  Math.abs(length(a.u) / length(b.u) - 1) < 0.12 &&
  Math.abs(Math.atan2(a.u[1], a.u[0]) - Math.atan2(b.u[1], b.u[0])) < 0.12 &&
  a.colours.filter((c, i) => c.some((v, k) => Math.abs(v - b.colours[i]![k]!) > 40)).length <= 2;

/**
 * A face held still over a few frames: it gives each sticker its median colour once `STILL_FRAMES` frames found the
 * same face at the same place. A frame without it, or with something else, is let pass (a hand, a blur, a false
 * face); several in a row start over.
 */
export class FaceReader {
  private frames: FoundFace[] = [];
  private stray: FoundFace[] = [];
  private missed = 0;
  /** How far along the face is to being read, 0 to 1. */
  get progress() {
    return this.frames.length / STILL_FRAMES;
  }
  reset() {
    this.frames = [];
    this.stray = [];
    this.missed = 0;
  }
  /** The frame's face (or none); the nine colours once the face was still long enough. */
  push(face: FoundFace | null): Rgb[] | null {
    const last = this.frames.at(-1);
    if (!face || (last && !same(face, last))) {
      if (face) this.stray.push(face);
      // Something else steady for three frames: the cube moved there.
      if (this.stray.length >= 3 && this.stray.every((f) => same(f, this.stray[0]!))) {
        this.frames = this.stray.slice();
        this.stray = [];
      } else if (++this.missed > 6) this.reset();
      return null;
    }
    this.missed = 0;
    this.stray = [];
    this.frames.push(face);
    if (this.frames.length < STILL_FRAMES) return null;
    const read = Array.from({ length: 9 }, (_, i) => [0, 1, 2].map((k) => median(this.frames.map((f) => f.colours[i]![k]!))) as unknown as Rgb);
    this.reset();
    return read;
  }
}
