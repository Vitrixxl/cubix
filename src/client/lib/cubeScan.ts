/**
 * A 3×3 read face by face, by the camera or by hand, for the assisted solve. The cube is held yellow on top and green
 * in front as `SmartCube` holds it: each face is read as seen from outside, row by row (the order of `slotsFor`), so the
 * colours come in Cubix's own sticker order, U, D, F, B, R, L.
 *
 * The camera reads each face where it is found (faceFinder.ts), held any way round, and the 54 colours are compared with each other (`readFace`, `resolve`,
 * ported from ~/dev/lab/rubik); each face is then turned as it must be (`orientFaces`). Colours are told apart by their hue
 * (`feature`), which a dim room or a camera that saturates keeps (~/dev/lab/scan). Should they make no real cube, `readCube`
 * finds what each of the six colours looks like, sorting the stickers nine to a colour; then it picks the cube that fits the colours
 * best among real cubes only: each corner and edge one of the cube's pieces, the corners twisted, the edges flipped
 * and the pieces swapped only as turns can. A sticker read wrong is put right by its piece; what stays doubtful is
 * said, sticker by sticker.
 */
import { FACES, slotsFor, type CubeState, type Face } from "../../shared/cube";
import { REAL_HELD_HEX } from "../../shared/cubeAppearance";
import { msg } from "../i18n/msg";
import { solveBeginner } from "./beginnerSolver";
import { faceMap, pieceColours } from "./solveAnalysis";

export type Rgb = readonly [number, number, number];
type V3 = [number, number, number];

const distance2 = (p: readonly number[], q: readonly number[]) => (p[0]! - q[0]!) ** 2 + (p[1]! - q[1]!) ** 2 + (p[2]! - q[2]!) ** 2;
const linear = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/**
 * A colour as the scan compares it: its hue on a circle, as far from the middle as it is saturated (white in the
 * middle), and a little of its brightness, all on linear RGB. A dim room scales a colour's channels alike and a camera
 * that saturates (a phone: channels at 255 or 0, yellow 255,255,0 beside orange 255,200,0) keeps little but its hue:
 * the hue is what tells red, orange and yellow apart there (~/dev/lab/scan).
 */
function feature(rgb: readonly number[]): V3 {
  const [r, g, b] = rgb as V3,
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    s = max > 0 ? (max - min) / max : 0,
    h = max === min ? 0 : max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  return [0.15 * Math.cbrt(max), s * Math.cos((h * Math.PI) / 3), s * Math.sin((h * Math.PI) / 3)];
}
/**
 * Each channel's gain that turns white's look grey: the light and the camera's white balance undone, every colour then
 * compared as under a neutral light (a warm camera's beige white grey again, its dull blue still blue).
 */
const balanceOf = (white: Rgb): V3 => {
  const w = white.map((v) => Math.max(linear(v), 1e-3)),
    mean = (w[0]! + w[1]! + w[2]!) / 3;
  return w.map((v) => mean / v) as V3;
};
const point = (rgb: Rgb, gains: readonly number[] = [1, 1, 1]): V3 => feature(rgb.map((v, k) => linear(v) * gains[k]!));
/** Where a colour stands on the hue circle, in degrees. */
const hueOf = (f: V3) => ((Math.atan2(f[2], f[1]) * 180) / Math.PI + 360) % 360;

/** How each colour looks to a camera before its face is read. */
export const REFS: Readonly<Record<Face, Rgb>> = { D: [235, 235, 235], U: [255, 240, 0], R: [255, 188, 0], L: [255, 40, 30], B: [0, 110, 255], F: [0, 220, 60] };
/** Stickers seen that count as much as a neutral guess of the light (`lightOf`). */
const TRUST = 18;
/** A gain kept within eight times either way: a channel a camera saturates to nothing gives no measure of the light. */
const bounded = (gain: number) => Math.min(8, Math.max(1 / 8, gain));

/**
 * The light on the stickers, as each channel's gain that undoes it: white's own look once read (`balanceOf`); before,
 * the stickers seen so far, grey on average (a scrambled cube shows its six colours about alike), trusted as they add up.
 */
function lightOf(seen: readonly Rgb[], white?: Rgb): V3 {
  if (white) return balanceOf(white);
  const sum = [0, 1, 2].map((k) => seen.reduce((s, c) => s + linear(c[k]!), 0)),
    mean = (sum[0]! + sum[1]! + sum[2]!) / 3,
    weight = seen.length / (seen.length + TRUST);
  return sum.map((v) => (v > 0 ? bounded((mean / v) ** weight) : 1)) as V3;
}

/**
 * The colours of the faces read so far (in `SCAN_FACES`'s order) and of the face `held` before the camera, whose centre
 * is `face`'s colour: each sticker the nearest colour's look under the light found (`lightOf`), a colour by its centre
 * once read. Before, white is grey whatever the light; red and orange are placed by the yellow (read first): cameras
 * squeeze or stretch the hues between red and yellow (a phone that saturates puts its yellow at 60°, an even camera at
 * 48°), orange at two fifths of its hue, red near the start.
 */
export function scanColours(faces: readonly (readonly Rgb[] | null)[], held?: { colours: readonly Rgb[]; face: Face }): { faces: (Face[] | null)[]; held: Face[] | null } {
  const refs: Record<Face, Rgb> = { ...REFS };
  faces.forEach((f, i) => f && (refs[SCAN_FACES[i]!] = f[4]!));
  if (held) refs[held.face] = held.colours[4]!;
  const white = refs.D === REFS.D ? undefined : refs.D,
    gains = lightOf([...faces.flatMap((f) => f ?? []), ...(held?.colours ?? [])], white),
    yellow = hueOf(point(refs.U, gains)),
    placed: Partial<Record<Face, number>> = { R: yellow * 0.4, L: yellow * 0.02 },
    looks = (Object.keys(REFS) as Face[]).map((face): [Face, V3] => {
      const hue = refs[face] === REFS[face] ? placed[face] : undefined;
      if (face === "D" && !white) return [face, [0.15, 0, 0]];
      return [face, hue === undefined ? point(refs[face], gains) : [0.15, Math.cos((hue * Math.PI) / 180), Math.sin((hue * Math.PI) / 180)]];
    }),
    // Every sticker seen, each face's centre its own colour.
    seen = [...faces.map((f, i) => f && { face: SCAN_FACES[i]!, colours: f }), held && { face: held.face, colours: held.colours }].filter((f) => !!f),
    points = seen.flatMap((f) => f.colours.map((c) => point(c, gains))),
    centres = seen.flatMap((f) => f.colours.map((_, k) => (k === 4 ? f.face : null))),
    order = looks.map(([face]) => face);
  // Grouped nine at most to a colour, the nearest first, then each colour's look the middle of its group and its first
  // look (`resolve` as far as the cube is seen): a camera that spreads a colour (an orange from 20° to 40°) keeps it whole.
  let labels: number[] = [],
    means = looks.map(([, look]) => look);
  for (let round = 0; round < 6; round++) {
    const count = order.map(() => 0);
    labels = centres.map((c) => (c ? order.indexOf(c) : -1));
    labels.forEach((k) => k >= 0 && count[k]!++);
    const pairs = points.flatMap((p, i) => (labels[i]! >= 0 ? [] : means.map((m, k) => ({ i, k, d: distance2(p, m) })))).sort((a, b) => a.d - b.d);
    for (const { i, k } of pairs)
      if (labels[i]! < 0 && count[k]! < 9) {
        labels[i] = k;
        count[k]!++;
      }
    means = looks.map(([, look], k) => {
      const group = points.filter((_, i) => labels[i] === k);
      return [0, 1, 2].map((c) => (look[c]! + group.reduce((s, p) => s + p[c]!, 0)) / (1 + group.length)) as V3;
    });
  }
  const named = labels.map((k) => order[k]!),
    read = seen.map((_, n) => named.slice(n * 9, n * 9 + 9));
  let n = 0;
  return { faces: faces.map((f) => (f ? read[n++]! : null)), held: held ? read[n]! : null };
}

const median8 = (values: number[]) => {
  const sorted = values.sort((a, b) => a - b),
    m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
};
export type Point = [number, number];
/** The camera's square as read, in pixels. */
export const VIEW = 480;
/** The nine cells, row by row, from the centre. */
const OFFSETS = [-1, 0, 1].flatMap((j) => [-1, 0, 1].map((i) => [i, j] as const));
/**
 * Where a lattice's cell is read, in steps along `u` and `v` from its middle: squares (middle, half side). The middle
 * half of the cell; the centre, which often carries a logo, toward its four corners.
 */
export const cellSquares = (centre: boolean): [number, number, number][] =>
  centre ? [-1, 1].flatMap((s) => [-1, 1].map((t): [number, number, number] => [(s * 3) / 8, (t * 3) / 8, 1 / 16])) : [[0, 0, 1 / 4]];
/** A cell's middle in the picture. */
export const cellAt = (centre: Point, u: Point, v: Point, i: number, j: number, s = 0, t = 0): Point => [
  centre[0] + (i + s) * u[0] + (j + t) * v[0],
  centre[1] + (i + s) * u[1] + (j + t) * v[1],
];

/**
 * The nine colours of the face standing on a lattice (its centre, the steps `u` to the next column and `v` to the next
 * row) in an RGBA picture, row by row as the camera sees it: the median of each channel over the cell's squares
 * (`cellSquares`), about a point a pixel, along `u` and `v` (the lab's `read_face`, the face turned and skewed as found).
 */
export function readFace(rgba: ArrayLike<number>, w: number, h: number, centre: Point, u: Point, v: Point): Rgb[] {
  const nu = Math.hypot(...u),
    nv = Math.hypot(...v);
  return OFFSETS.map(([i, j]) => {
    const channels: number[][] = [[], [], []];
    for (const [s0, t0, half] of cellSquares(!i && !j)) {
      const ns = Math.max(1, Math.round(2 * half * nu)),
        nt = Math.max(1, Math.round(2 * half * nv));
      for (let b = 0; b < nt; b++)
        for (let a = 0; a < ns; a++) {
          const [x, y] = cellAt(centre, u, v, i, j, s0 - half + ((a + 0.5) * 2 * half) / ns, t0 - half + ((b + 0.5) * 2 * half) / nt).map(Math.floor) as Point;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          for (let k = 0; k < 3; k++) channels[k]!.push(rgba[(y * w + x) * 4 + k]!);
        }
    }
    return channels.map((c) => (c.length ? Math.trunc(median8(c)) : 0)) as unknown as Rgb;
  });
}

/** The faces in the order they are read, by their centre's colour: yellow, orange, red, blue, green, white. */
export const SCAN_FACES: readonly Face[] = ["U", "R", "L", "B", "F", "D"];
/**
 * The six faces read in `SCAN_FACES`'s order, each held any way round and read as the camera sees it, in Cubix's
 * sticker order, each face turned as it must be (`orientFaces`).
 */
export const cubeSamples = (faces: readonly (readonly Rgb[])[]): Rgb[] => orientFaces(FACES.flatMap((face) => faces[SCAN_FACES.indexOf(face)]!));

/** The cube as read so far, in Cubix's order: each face's colours (`scanColours`), else only its centre. */
export const scanStickers = (colours: readonly (readonly Face[] | null)[]): (Face | null)[] =>
  FACES.flatMap((face): (Face | null)[] => [...(colours[SCAN_FACES.indexOf(face)] ?? Array.from({ length: 9 }, (_, k) => (k === 4 ? face : null)))]);

/**
 * The 54 colours read (Cubix's order, centres where the cube is held) compared with each other rather than with
 * `REFS` (the lab's `resolve`): a group per centre, each given exactly nine stickers, the nearest first, then the
 * groups' means again, ten times; each group named after its centre. A warm camera's beige white stays apart.
 */
export function resolve(samples: readonly Rgb[]): Face[] {
  const gains = balanceOf(samples[WHITE]!),
    pts = samples.map((s) => point(s, gains));
  let means = FACES.map((_, k) => pts[k * 9 + 4]!);
  const label = new Array<number>(54);
  for (let round = 0; round < 10; round++) {
    const pairs = pts.flatMap((p, i) => means.map((m, k) => ({ i, k, d: Math.sqrt(distance2(p, m)) }))).sort((a, b) => a.d - b.d),
      count = FACES.map(() => 1);
    label.fill(-1);
    FACES.forEach((_, k) => (label[k * 9 + 4] = k));
    for (const { i, k } of pairs)
      if (label[i]! < 0 && count[k]! < 9) {
        label[i] = k;
        count[k]!++;
      }
    means = FACES.map((_, k) => {
      const group = pts.filter((_, i) => label[i] === k);
      return [0, 1, 2].map((c) => group.reduce((s, p) => s + p[c]!, 0) / group.length) as V3;
    });
  }
  return label.map((k) => FACES[k]!);
}

/** The cheapest way to give each row its own column (Hungarian method, square matrix): the column of each row. */
export function assign(cost: readonly (readonly number[])[]): number[] {
  const n = cost.length,
    u = new Float64Array(n + 1),
    v = new Float64Array(n + 1),
    p = new Int32Array(n + 1),
    way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(Infinity),
      used = new Uint8Array(n + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0]!;
      let delta = Infinity,
        j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++)
        if (used[j]) {
          u[p[j]!]! += delta;
          v[j]! -= delta;
        } else minv[j]! -= delta;
      j0 = j1;
    } while (p[j0]);
    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0);
  }
  const out = new Array<number>(n);
  for (let j = 1; j <= n; j++) out[p[j]! - 1] = j - 1;
  return out;
}

// The cube's pieces. A corner's stickers go round it the same way on every corner, from its U or D sticker; an edge's
// start from its U or D sticker, else its F or B one. A piece's twist (or flip) is where its own first colour lies.
const SLOTS = slotsFor(3);
const byPlace = new Map<string, number[]>();
SLOTS.forEach((s, i) => byPlace.set(s.p.join(), [...(byPlace.get(s.p.join()) ?? []), i]));
const det = (a: readonly number[], b: readonly number[], c: readonly number[]) =>
  a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!);
const first = (axis: number) => (a: number, b: number) => Math.abs(SLOTS[b]!.n[axis]!) - Math.abs(SLOTS[a]!.n[axis]!);
/** The stickers of each corner place and of each edge place, in order. */
export const CORNERS = [...byPlace.values()]
  .filter((s) => s.length === 3)
  .map((s) => {
    const [a, b, c] = s.sort(first(1)) as [number, number, number];
    return det(SLOTS[a]!.n, SLOTS[b]!.n, SLOTS[c]!.n) > 0 ? [a, b, c] : [a, c, b];
  });
export const EDGES = [...byPlace.values()].filter((s) => s.length === 2).map((s) => (SLOTS[s[0]!]!.n[1] || SLOTS[s[1]!]!.n[1] ? s.sort(first(1)) : s.sort(first(2))));
const HOME = SLOTS.map((s) => FACES.indexOf(s.face));
/** Each piece's colours (faces' indices), in the order of its place on a solved cube. */
const CORNER_PIECES = CORNERS.map((s) => s.map((i) => HOME[i]!)),
  EDGE_PIECES = EDGES.map((s) => s.map((i) => HOME[i]!));

/** Odd (1) or even (0) permutation. */
function parity(perm: readonly number[]) {
  const seen = new Uint8Array(perm.length);
  let odd = 0;
  for (let i = 0; i < perm.length; i++) {
    let length = 0;
    for (let j = i; !seen[j]; j = perm[j]!, length++) seen[j] = 1;
    if (length) odd ^= (length - 1) & 1;
  }
  return odd;
}

/** The search steps a cube's reading has left (a picture read all wrong makes for long searches). */
let left = Infinity;

interface Arrangement {
  /** The piece at each place, and its twist or flip there. */
  piece: number[];
  turn: number[];
  cost: number;
}

/**
 * The cheapest arrangement of pieces in places, for each parity of the permutation (an even one first), their twists
 * summing to a whole turn: `cost[place][piece][turn]`. A depth-first search, the surest places first and the cheapest
 * pieces first, cut wherever the cheapest completion cannot do better; past `budget` steps it keeps what it has.
 */
export function arrange(cost: number[][][], budget = 20_000): (Arrangement | null)[] {
  budget = Math.min(budget, left);
  const n = cost.length,
    best: (Arrangement | null)[] = [null, null],
    // Each place's pieces and twists, the cheapest first.
    options = cost.map((row) => row.flatMap((twists, k) => twists.map((c, t) => ({ k, t, c }))).sort((a, b) => a.c - b.c)),
    // The surest places first: the widest gap between their best piece and the next other piece.
    order = options
      .map((list, place) => ({ place, gap: list.find((o) => o.k !== list[0]!.k)!.c - list[0]!.c }))
      .sort((a, b) => b.gap - a.gap)
      .map((o) => o.place),
    used = new Uint8Array(n),
    piece = new Array<number>(n).fill(-1),
    turn = new Array<number>(n).fill(0),
    turns = cost[0]![0]!.length;
  let steps = 0;
  const bar = () => Math.max(best[0]?.cost ?? Infinity, best[1]?.cost ?? Infinity),
    cheapest = (place: number) => options[place]!.find((o) => !used[o.k])!.c;
  const search = (depth: number, total: number, twist: number) => {
    if (depth === n) {
      const odd = parity(piece);
      if (!best[odd] || total < best[odd]!.cost) best[odd] = { piece: piece.slice(), turn: turn.slice(), cost: total };
      return;
    }
    if (++steps > budget) return;
    // The cheapest the later places could cost, each with its best free piece.
    let rest = 0;
    for (let d = depth + 1; d < n; d++) rest += cheapest(order[d]!);
    const place = order[depth]!,
      last = depth === n - 1;
    for (const { k, t, c } of options[place]!) {
      if (total + c + rest >= bar()) break;
      if (used[k] || (last && (twist + t) % turns)) continue;
      used[k] = 1;
      piece[place] = k;
      turn[place] = t;
      search(depth + 1, total + c, (twist + t) % turns);
      used[k] = 0;
      piece[place] = -1;
    }
  };
  search(0, 0, 0);
  left -= Math.min(steps, budget);
  return best;
}

export interface CubeRead {
  /** The colour of each sticker. */
  colours: Face[];
  /** How sure each one is, 0 to 1. */
  confidence: number[];
}

const faceOf = (i: number) => Math.floor(i / 9);
/** White's centre among the 54 stickers, in Cubix's order. */
const WHITE = FACES.indexOf("D") * 9 + 4;
const median = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b),
    m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
};
/** The median of each channel. */
const middle = (colours: readonly V3[]): V3 => [0, 1, 2].map((k) => median(colours.map((c) => c[k]!))) as V3;

/**
 * The six faces' stickers sorted in six groups of nine, one to a colour, under a guess of each face's light (`gains`),
 * each colour's look found as they settle. The groups are not named yet.
 */
function cluster(x: readonly V3[], gains: readonly V3[]) {
  let labels = x.map((_, i) => faceOf(i));
  for (let round = 0; round < 10; round++) {
    const seen = x.map((c, i) => c.map((v, k) => v * gains[faceOf(i)]![k]!) as V3),
      features = seen.map(feature),
      // Each colour as it looks: the first time its centre, then the median of its nine stickers.
      looks = FACES.map((_, c) => feature(round ? middle(seen.filter((_, i) => labels[i] === c)) : seen[c * 9 + 4]!)),
      // Nine to a colour, the centres too (a centre may carry a logo or a glint: groups are named later).
      columns = FACES.flatMap((_, c) => Array<number>(9).fill(c)),
      next = assign(features.map((f) => columns.map((c) => distance2(f, looks[c]!)))).map((column) => columns[column]!);
    const settled = round > 0 && next.every((c, i) => c === labels[i]);
    labels = next;
    if (settled) break;
  }
  return labels;
}

/**
 * The price of each group for each sticker under these gains: the negative log-likelihood of a heavy-tailed law
 * (Student's, three degrees of freedom) around the group's median look, so that one glint does not outweigh its piece;
 * and the part shared by all, which makes prices under other gains comparable.
 */
function prices(x: readonly V3[], labels: readonly number[], gains: readonly V3[]) {
  const features = x.map((c, i) => feature(c.map((v, k) => v * gains[faceOf(i)]![k]!))),
    looks = FACES.map((_, c) => middle(features.filter((_, i) => labels[i] === c))),
    // How far stickers stray from their group, all groups together, with a floor for a perfect picture.
    spread = Math.max(4e-4, features.reduce((s, f, i) => s + distance2(f, looks[labels[i]!]!), 0) / 54) / 3;
  return { price: features.map((f) => looks.map((l) => 3 * Math.log1p(distance2(f, l) / (3 * spread)))), base: 54 * 1.5 * Math.log(spread) };
}

/**
 * The cube read from its 54 colours (Cubix's sticker order, centres where the cube is held): the real cube that fits
 * them best, and how sure each sticker is.
 */
export function readCube(samples: readonly Rgb[]): CubeRead {
  left = 300_000;
  const gains = balanceOf(samples[WHITE]!),
    x = samples.map((s) => s.map((v, k) => Math.max(1e-4, linear(v) * gains[k]!)) as V3);
  // First guesses of each face's light: none; a grey face on average (the six colours mixed come out grey); its centre
  // as its colour usually looks.
  const all = [0, 1, 2].map((k) => x.reduce((s, c) => s + c[k]!, 0) / 54),
    guesses: V3[][] = [
      FACES.map(() => [1, 1, 1]),
      FACES.map((_, f) => [0, 1, 2].map((k) => (all[k]! / (x.slice(f * 9, f * 9 + 9).reduce((s, c) => s + c[k]!, 0) / 9)) ** 0.7) as V3),
      FACES.map((_, f) => [0, 1, 2].map((k) => bounded((USUAL_RGB[f]![k]! + 0.02) / (x[f * 9 + 4]![k]! + 0.02))) as V3),
    ];
  let best: (CubeRead & { cost: number }) | null = null;
  for (const guess of guesses) {
    let labels = cluster(x, guess),
      { price, base } = prices(x, labels, guess),
      read: (CubeRead & { cost: number }) | null = null;
    // Each group named after the centre most like it, all six at once. Should centres carry a glint or a logo, other
    // names are weighed too: each two swapped (the cube read decides), and the names turned as the whole cube turns
    // (a real cube still; the centres and the colours' usual looks decide).
    const name = assign(FACES.map((_, f) => price[f * 9 + 4]!)),
      swapped = name.flatMap((_, a) => name.slice(a + 1).map((_, k) => name.map((c, f) => (f === a ? name[a + 1 + k]! : f === a + 1 + k ? name[a]! : c)))),
      looks = FACES.map((_, c) => middle(x.filter((_, i) => labels[i] === c))),
      usual = (named: number[]) => FACES.reduce((s, _, f) => s + USUAL_WEIGHT * Math.log1p(distance2(feature(looks[named[f]!]!), USUAL[f]!) / 0.01), 0);
    for (const named of [...TURNS.map((turn) => turn.map((f) => name[f]!)), ...swapped]) {
      const extra = usual(named),
        next = decide(
          price.map((p) => named.map((c) => p[c]!)),
          (read?.cost ?? Infinity) - extra,
        );
      if (next && (next.cost += extra) < (read?.cost ?? Infinity)) read = next;
    }
    if (!read) continue;
    read.cost += base;
    // The cube read sorts the stickers better than the groups did: each colour's look again.
    for (let round = 0; round < 3; round++) {
      labels = read.colours.map((c) => FACES.indexOf(c));
      ({ price, base } = prices(x, labels, guess));
      const next = decide(price);
      if (!next || next.cost + base >= read.cost) break;
      read = { ...next, cost: next.cost + base };
    }
    if (!best || read.cost < best.cost) best = read;
  }
  return best ?? { colours: samples.map((_, i) => FACES[faceOf(i)]!), confidence: samples.map(() => 0) };
}

/** The 24 ways to hold the cube: for each, the face that shows where each face was. */
const TURNS = (() => {
  const seen = new Map<string, string[]>([["", []]]);
  for (const [, frame] of seen)
    for (const token of ["x", "y"]) {
      const next = [...frame, token],
        map = faceMap(next),
        key = FACES.map((f) => map[f]).join("");
      if (![...seen.values()].some((other) => FACES.map((f) => faceMap(other)[f]).join("") === key)) seen.set(key, next);
    }
  return [...seen.values()].map((frame) => FACES.map((f) => FACES.indexOf(faceMap(frame)[f])));
})();
/** How each colour usually looks, and how much that weighs against the centres and the pieces. */
const USUAL_RGB = FACES.map((f) => [REAL_HELD_HEX[f] >> 16, (REAL_HELD_HEX[f] >> 8) & 255, REAL_HELD_HEX[f] & 255].map(linear)),
  USUAL = USUAL_RGB.map(feature);
const USUAL_WEIGHT = 2;

/**
 * The real cube cheapest for these prices (`price[sticker][face]`), centres included, and how sure each sticker is;
 * null when it cannot cost less than `bar` (each place given its cheapest piece already costs more).
 */
function decide(price: number[][], bar = Infinity): (CubeRead & { cost: number }) | null {
  const place = (stickers: number[][], pieces: number[][]) =>
    stickers.map((slots) => pieces.map((colours) => colours.map((_, t) => slots.reduce((s, slot, j) => s + price[slot]![colours[(j - t + colours.length) % colours.length]!]!, 0))));
  const cornerCost = place(CORNERS, CORNER_PIECES),
    edgeCost = place(EDGES, EDGE_PIECES),
    centres = FACES.reduce((s, _, f) => s + price[f * 9 + 4]![f]!, 0),
    floor = [...cornerCost, ...edgeCost].reduce((s, row) => s + Math.min(...row.flat()), centres);
  if (floor >= bar) return null;
  const corners = arrange(cornerCost),
    edges = arrange(edgeCost),
    // Corners and edges swapped alike: both even, or both odd.
    odd = [0, 1].filter((p) => corners[p] && edges[p]).sort((a, b) => corners[a]!.cost + edges[a]!.cost - corners[b]!.cost - edges[b]!.cost)[0];
  if (odd === undefined) return null;
  const colours = FACES.flatMap((_, f) => Array<number>(9).fill(f)),
    confidence = Array<number>(54).fill(1);
  const lay = (stickers: number[][], pieces: number[][], cost: number[][][], chosen: Arrangement) =>
    stickers.forEach((slots, place) => {
      const k = chosen.piece[place]!,
        t = chosen.turn[place]!,
        own = cost[place]![k]![t]!,
        // How sure: this piece and twist against every other one here.
        sure = 1 / cost[place]!.flat().reduce((s, c) => s + Math.exp((own - c) / 2), 0);
      slots.forEach((slot, j) => {
        colours[slot] = pieces[k]![(j - t + slots.length) % slots.length]!;
        confidence[slot] = sure;
      });
    });
  lay(CORNERS, CORNER_PIECES, cornerCost, corners[odd]!);
  lay(EDGES, EDGE_PIECES, edgeCost, edges[odd]!);
  return { colours: colours.map((c) => FACES[c]!), confidence, cost: corners[odd]!.cost + edges[odd]!.cost + centres };
}

/** The colour of each of the 54 stickers read by the camera (see `readCube`). */
export const classify = (samples: readonly Rgb[]): Face[] => readCube(samples).colours;

/** A held state with these colours: the stickers of a colour are numbered in turn, which draws and turns the same. */
export function scannedState(colours: readonly Face[]): CubeState {
  const counts = FACES.map(() => 0);
  return Uint16Array.from(colours, (face) => FACES.indexOf(face) * 9 + counts[FACES.indexOf(face)]!++);
}

/** Every corner and edge, by its place. */
const PLACES = [...new Map(slotsFor(3).filter((s) => s.p.filter((v) => v === 0).length < 2).map((s) => [s.p.join(), s.p])).values()];
const pieceSet = (colours: readonly Face[]) => PLACES.map((p) => pieceColours(colours as Face[], p).sort().join("")).sort().join();
const SOLVED = pieceSet(slotsFor(3).map((s) => s.face));

/** A face's nine stickers (row by row) turned a quarter turn. */
const quarter = <T>(face: readonly T[]): T[] => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => face[(2 - c) * 3 + r]!));
const SOLVED_PIECES = new Set(SOLVED.split(","));

/**
 * The 54 colours read (Cubix's order), each face held any way round, with each face turned as it must be (the lab's
 * `orient`): of the 4⁶ ways to turn the six faces, the first whose colours (`resolve`) make a cube that can be solved,
 * else the one with the most of the cube's pieces, for `readCube` to put right.
 */
export function orientFaces(samples: readonly Rgb[]): Rgb[] {
  const turns = (face: readonly unknown[]) => [face, quarter(face), quarter(quarter(face)), quarter(quarter(quarter(face)))],
    colours = resolve(samples),
    turnedSamples = FACES.map((_, f) => turns(samples.slice(f * 9, f * 9 + 9)) as Rgb[][]),
    turnedColours = FACES.map((_, f) => turns(colours.slice(f * 9, f * 9 + 9)) as Face[][]),
    tried = new Set<string>();
  let best = { pieces: -1, turn: [0, 0, 0, 0, 0, 0] };
  for (let n = 0; n < 4 ** 6; n++) {
    const turn = FACES.map((_, f) => (n >> (2 * f)) & 3),
      read = turn.flatMap((k, f) => turnedColours[f]![k]!),
      key = read.join("");
    // Faces alike all round (a solved cube) turn many ways into the same colours: each tried once.
    if (tried.has(key)) continue;
    tried.add(key);
    const pieces = new Set(PLACES.map((p) => pieceColours(read, p).sort().join("")).filter((piece) => SOLVED_PIECES.has(piece))).size;
    if (pieces === PLACES.length && !scanProblem(read)) return turn.flatMap((k, f) => turnedSamples[f]![k]!);
    if (pieces > best.pieces) best = { pieces, turn };
  }
  return best.turn.flatMap((k, f) => turnedSamples[f]![k]!);
}

/** What is wrong with the colours read, or null when they make a cube that can be solved. */
export function scanProblem(colours: readonly (Face | null)[]): string | null {
  if (colours.some((c) => !c)) return msg("Some stickers have no colour yet.");
  const counts = FACES.map((face) => colours.filter((c) => c === face).length);
  if (counts.some((n) => n !== 9)) return msg("Each colour must show on nine stickers.");
  if (pieceSet(colours as Face[]) !== SOLVED) return msg("Some pieces do not exist on a cube: check the colours.");
  if (!solveBeginner(scannedState(colours as Face[]))) return msg("This cube cannot be solved: a piece is twisted or two pieces are swapped. Check the colours.");
  return null;
}
