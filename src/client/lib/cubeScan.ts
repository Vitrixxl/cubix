/**
 * A 3×3 read face by face, by the camera or by hand, for the assisted solve. The cube is held yellow on top and green
 * in front as `SmartCube` holds it: each face is read as seen from outside, row by row (the order of `slotsFor`), so the
 * colours come in Cubix's own sticker order, U, D, F, B, R, L.
 *
 * The camera gives each sticker a colour, each face under its own light (the cube turns between them, the camera
 * adjusts itself). `readCube` finds at once what each of the six colours looks like and how each face's light tints it
 * (a gain per channel and face), sorting the stickers nine to a colour; then it picks the cube that fits the colours
 * best among real cubes only: each corner and edge one of the cube's pieces, the corners twisted, the edges flipped
 * and the pieces swapped only as turns can. A sticker read wrong is put right by its piece; what stays doubtful is
 * said, sticker by sticker.
 */
import { FACES, slotsFor, type CubeState, type Face } from "../../shared/cube";
import { HELD_HEX } from "../../shared/cubeAppearance";
import { msg } from "../i18n/msg";
import { solveBeginner } from "./beginnerSolver";
import { faceMap, pieceColours } from "./solveAnalysis";

export type Rgb = readonly [number, number, number];
type V3 = [number, number, number];

const linear = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** OKLab of a linear RGB colour: a space where distances match what the eye sees, lightness apart from hue. */
function oklab([r, g, b]: readonly number[]): V3 {
  const l = Math.cbrt(0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!),
    m = Math.cbrt(0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!),
    s = Math.cbrt(0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** How different two colours look (ΔE in OKLab, ×100). */
export const difference = (a: Rgb, b: Rgb) => {
  const [p, q] = [oklab(a.map(linear)), oklab(b.map(linear))];
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

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

/** Lightness counts less than hue: the light on a face changes it most. */
const LIGHTNESS = 0.35;
const feature = (rgb: readonly number[]): V3 => {
  const [l, a, b] = oklab(rgb);
  return [LIGHTNESS * l, a, b];
};
const distance2 = (p: readonly number[], q: readonly number[]) => (p[0]! - q[0]!) ** 2 + (p[1]! - q[1]!) ** 2 + (p[2]! - q[2]!) ** 2;
const faceOf = (i: number) => Math.floor(i / 9);
const median = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b),
    m = sorted.length >> 1;
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
};
/** The median of each channel. */
const middle = (colours: readonly V3[]): V3 => [0, 1, 2].map((k) => median(colours.map((c) => c[k]!))) as V3;

/**
 * Each face's gains for these groups: the median ratio of its stickers' colours to their group's (which one glint does
 * not sway), a clipped or black channel left out; their geometric mean kept at one, since their scale is arbitrary.
 */
function relight(x: readonly V3[], labels: readonly number[], gains: V3[]): V3[] {
  const seen = x.map((c, i) => c.map((v, k) => v * gains[faceOf(i)]![k]!) as V3),
    target = FACES.map((_, c) => middle(seen.filter((_, i) => labels[i] === c)));
  const next = FACES.map(
    (_, f) =>
      [0, 1, 2].map((k) => {
        const ratios: number[] = [];
        for (let i = f * 9; i < f * 9 + 9; i++) if (x[i]![k]! < 0.97 && x[i]![k]! > 0.004) ratios.push(Math.log(target[labels[i]!]![k]! / x[i]![k]!));
        return ratios.length ? Math.exp(median(ratios)) : gains[f]![k]!;
      }) as V3,
  );
  const mean = [0, 1, 2].map((k) => Math.exp(next.reduce((s, g) => s + Math.log(g[k]!), 0) / 6));
  return next.map((g) => g.map((v, k) => v / mean[k]!) as V3);
}

/**
 * The six faces' stickers sorted in six groups of nine, one to a colour, each face's light and each colour's look
 * found together, from a first guess of each face's light (`gains`). The groups are not named yet.
 */
function cluster(x: readonly V3[], gains: V3[]) {
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
    gains = relight(x, labels, gains);
    if (settled) break;
  }
  return { labels, gains };
}

/**
 * The price of each group for each sticker under these gains: the negative log-likelihood of a heavy-tailed law
 * (Student's, three degrees of freedom) around the group's median look, so that one glint does not outweigh its piece;
 * and the part shared by all, which makes prices under other gains comparable.
 */
function prices(x: readonly V3[], labels: readonly number[], gains: V3[]) {
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
  const x = samples.map((s) => s.map((v) => Math.max(1e-4, linear(v))) as V3);
  // First guesses of each face's light: none; a grey face on average (the six colours mixed come out grey); its centre
  // as its colour usually looks.
  const all = [0, 1, 2].map((k) => x.reduce((s, c) => s + c[k]!, 0) / 54),
    guesses: V3[][] = [
      FACES.map(() => [1, 1, 1]),
      FACES.map((_, f) => [0, 1, 2].map((k) => (all[k]! / (x.slice(f * 9, f * 9 + 9).reduce((s, c) => s + c[k]!, 0) / 9)) ** 0.7) as V3),
      FACES.map((_, f) => [0, 1, 2].map((k) => Math.min(8, Math.max(1 / 8, (USUAL_RGB[f]![k]! + 0.02) / (x[f * 9 + 4]![k]! + 0.02)))) as V3),
    ];
  let best: (CubeRead & { cost: number }) | null = null;
  for (const guess of guesses) {
    let { labels, gains } = cluster(x, guess),
      { price, base } = prices(x, labels, gains),
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
    // The cube read sorts the stickers better than the groups did: each face's light and each colour's look again.
    for (let round = 0; round < 3; round++) {
      labels = read.colours.map((c) => FACES.indexOf(c));
      gains = relight(x, labels, gains);
      ({ price, base } = prices(x, labels, gains));
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
const USUAL_RGB = FACES.map((f) => [HELD_HEX[f] >> 16, (HELD_HEX[f] >> 8) & 255, HELD_HEX[f] & 255].map(linear)),
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

/** What is wrong with the colours read, or null when they make a cube that can be solved. */
export function scanProblem(colours: readonly (Face | null)[]): string | null {
  if (colours.some((c) => !c)) return msg("Some stickers have no colour yet.");
  const counts = FACES.map((face) => colours.filter((c) => c === face).length);
  if (counts.some((n) => n !== 9)) return msg("Each colour must show on nine stickers.");
  if (pieceSet(colours as Face[]) !== SOLVED) return msg("Some pieces do not exist on a cube: check the colours.");
  if (!solveBeginner(scannedState(colours as Face[]))) return msg("This cube cannot be solved: a piece is twisted or two pieces are swapped. Check the colours.");
  return null;
}
