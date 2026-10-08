/**
 * Cross practice on the 3×3: a random state whose best cross, XCross (cross and one F2L pair) or XXCross (cross and
 * two pairs) takes exactly `moves` face turns, the cube held with white on the bottom and green in front (z2). The
 * rest of the cube is random; a 3×3 solver turns the state into a scramble.
 *
 * States use cubing.js's 3×3 pattern layout: position i holds piece `pieces[i]` with `orientation[i]`.
 * Edges: UF UR UB UL DF DR DB DL FR FL BR BL. Corners: UFR URB UBL ULF DRF DFL DLB DBR. White is on U.
 */
import { msg } from "../client/i18n/msg";

export type Orbit = { pieces: number[]; orientation: number[] };
export type PatternData = { EDGES: Orbit; CORNERS: Orbit; CENTERS: Orbit };
type Move = { face: number; edges: [number[], number[]]; corners: [number[], number[]] };

export const CROSS_TARGETS = ["cross", "xcross", "xxcross"] as const;
export type CrossTarget = (typeof CROSS_TARGETS)[number];
export const CROSS_TARGET_LABELS: Record<CrossTarget, string> = { cross: "Cross", xcross: "XCross", xxcross: "XXCross" };
/** What each target builds, to translate where shown. */
export const CROSS_TARGET_DETAILS: Record<CrossTarget, string> = { cross: msg("The four edges"), xcross: msg("Cross and one pair"), xxcross: msg("Cross and two pairs") };
/** The move counts offered per target, the middle one by default. */
export const CROSS_MOVES: Record<CrossTarget, readonly number[]> = { cross: [4, 5, 6], xcross: [5, 6, 7], xxcross: [6, 7, 8] };
export const isCrossTarget = (value: unknown): value is CrossTarget => CROSS_TARGETS.includes(value as CrossTarget);
export const crossMovesFor = (target: CrossTarget, moves: unknown) =>
  CROSS_MOVES[target].includes(moves as number) ? (moves as number) : CROSS_MOVES[target][1]!;
/** The scramble type of a target and move count, as `xcross-6`. */
export const crossScrambleType = (target: CrossTarget, moves: number) => `${target}-${moves}`;
export const crossTrainingType = (type: string): { target: CrossTarget; moves: number } | null => {
  const [, target, moves] = /^(x{0,2}cross)-(\d)$/.exec(type) ?? [];
  return isCrossTarget(target) && CROSS_MOVES[target].includes(Number(moves)) ? { target, moves: Number(moves) } : null;
};

// Quarter turns of U D R L F B: permutation and orientation change of the edges, then of the corners.
const FACES: [number[], number[], number[], number[]][] = [
  [[1, 2, 3, 0, 4, 5, 6, 7, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 2, 3, 0, 4, 5, 6, 7], [0, 0, 0, 0, 0, 0, 0, 0]],
  [[0, 1, 2, 3, 7, 4, 5, 6, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 1, 2, 3, 5, 6, 7, 4], [0, 0, 0, 0, 0, 0, 0, 0]],
  [[0, 8, 2, 3, 4, 10, 6, 7, 5, 9, 1, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [4, 0, 2, 3, 7, 5, 6, 1], [2, 1, 0, 0, 1, 0, 0, 2]],
  [[0, 1, 2, 11, 4, 5, 6, 9, 8, 3, 10, 7], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 1, 6, 2, 4, 3, 5, 7], [0, 0, 2, 1, 0, 2, 1, 0]],
  [[9, 1, 2, 3, 8, 5, 6, 7, 0, 4, 10, 11], [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0], [3, 1, 2, 5, 0, 4, 6, 7], [1, 0, 0, 2, 2, 1, 0, 0]],
  [[0, 1, 10, 3, 4, 5, 11, 7, 8, 9, 6, 2], [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1], [0, 7, 1, 3, 4, 5, 2, 6], [0, 2, 1, 0, 0, 0, 2, 1]],
];
/** The white cross edges (on U in the scramble orientation). */
const CROSS_EDGES = [0, 1, 2, 3];
/** The F2L pairs: corner and slot edge, with the slot's name once the cube is turned over with z2 (U↔D, R↔L). */
const PAIRS = [
  { corner: 0, edge: 8, slot: "FL" },
  { corner: 1, edge: 10, slot: "BL" },
  { corner: 2, edge: 11, slot: "BR" },
  { corner: 3, edge: 9, slot: "FR" },
] as const;
const PAIR_COUNT: Record<CrossTarget, number> = { cross: 0, xcross: 1, xxcross: 2 };

const applyOrbit = (orbit: Orbit, [permutation, delta]: [number[], number[]], n: number): Orbit => ({
  pieces: permutation.map(p => orbit.pieces[p]!),
  orientation: permutation.map((p, i) => (orbit.orientation[p]! + delta[i]!) % n),
});
const compose = ([p1, o1]: [number[], number[]], [p2, o2]: [number[], number[]], n: number): [number[], number[]] =>
  [p2.map(p => p1[p]!), p2.map((p, i) => (o1[p]! + o2[i]!) % n)];
/** All 18 face turns: quarter, half and counter-clockwise turn of each face. */
const MOVES: Move[] = FACES.flatMap(([ep, eo, cp, co], face) => {
  const quarter = { edges: [ep, eo] as [number[], number[]], corners: [cp, co] as [number[], number[]] };
  const turns = [quarter];
  for (let i = 1; i < 3; i++) {
    const last = turns.at(-1)!;
    turns.push({ edges: compose(last.edges, quarter.edges, 2), corners: compose(last.corners, quarter.corners, 3) });
  }
  return turns.map(t => ({ face, ...t }));
});
const apply = (state: PatternData, move: Move): PatternData =>
  ({ ...state, EDGES: applyOrbit(state.EDGES, move.edges, 2), CORNERS: applyOrbit(state.CORNERS, move.corners, 3) });
/** Skip a turn of the previous face, and of its opposite face in one fixed order, as they never shorten a solution. */
const redundant = (face: number, previous: number) => face === previous || (face >> 1 === previous >> 1 && face < previous);

/*
 * The search tracks only the pieces that matter, each as a coordinate `position × twists + orientation`: the four
 * cross edges, then per pair its corner and edge. Turning a coordinate is a table lookup.
 */
const coordMoves = (index: 0 | 1, size: number, twists: number) => MOVES.map(move => {
  const [permutation, delta] = index ? move.corners : move.edges, table = new Int8Array(size * twists);
  permutation.forEach((from, to) => { for (let o = 0; o < twists; o++) table[from * twists + o] = to * twists + (o + delta[to]!) % twists; });
  return table;
});
const EDGE_MOVES = coordMoves(0, 12, 2), CORNER_MOVES = coordMoves(1, 8, 3);
/** Search state: cross edges 0–3, then pair edges 4–7 and pair corners 8–11 (in `PAIRS` order). */
type Coords = Int8Array;
const solvedCoords = (): Coords => Int8Array.from([...CROSS_EDGES.map(e => e * 2), ...PAIRS.map(p => p.edge * 2), ...PAIRS.map(p => p.corner * 3)]);
const turn = (c: Coords, m: number): Coords => {
  const e = EDGE_MOVES[m]!, k = CORNER_MOVES[m]!, next = new Int8Array(12);
  for (let i = 0; i < 8; i++) next[i] = e[c[i]!]!;
  for (let i = 8; i < 12; i++) next[i] = k[c[i]!]!;
  return next;
};
function coordsOf(state: PatternData): Coords {
  const c = new Int8Array(12), edgeAt = (piece: number) => state.EDGES.pieces.indexOf(piece), cornerAt = (piece: number) => state.CORNERS.pieces.indexOf(piece);
  CROSS_EDGES.forEach((piece, i) => { const at = edgeAt(piece); c[i] = at * 2 + state.EDGES.orientation[at]!; });
  PAIRS.forEach(({ edge, corner }, i) => {
    const e = edgeAt(edge), k = cornerAt(corner);
    c[4 + i] = e * 2 + state.EDGES.orientation[e]!;
    c[8 + i] = k * 3 + state.CORNERS.orientation[k]!;
  });
  return c;
}

/** Breadth-first distances over a few coordinates, each `key` packing them into one table index. */
function distances(size: number, start: Coords, key: (c: Coords) => number): Uint8Array {
  const table = new Uint8Array(size).fill(255);
  let frontier = [start];
  table[key(start)] = 0;
  for (let depth = 1; frontier.length; depth++) {
    const next: Coords[] = [];
    for (const c of frontier) for (let m = 0; m < 18; m++) {
      const n = turn(c, m), i = key(n);
      if (table[i] === 255) { table[i] = depth; next.push(n); }
    }
    frontier = next;
  }
  return table;
}
// Exact cross distance (24⁴ entries) and per pair its corner and edge distance (24² entries), built on first use.
let crossTable: Uint8Array | undefined, pairTables: Uint8Array[] | undefined;
const crossKey = (c: Coords) => ((c[0]! * 24 + c[1]!) * 24 + c[2]!) * 24 + c[3]!;
const pairKey = (i: number) => (c: Coords) => c[4 + i]! * 24 + c[8 + i]!;
function tables() {
  crossTable ??= distances(24 ** 4, solvedCoords(), crossKey);
  pairTables ??= PAIRS.map((_, i) => distances(576, solvedCoords(), pairKey(i)));
  return { cross: crossTable, pairs: pairTables };
}
const pairSolved = (c: Coords, i: number) => c[4 + i] === PAIRS[i]!.edge * 2 && c[8 + i] === PAIRS[i]!.corner * 3;
const solvedPairs = (c: Coords) => PAIRS.flatMap((_, i) => (pairSolved(c, i) ? [i] : []));
const solved = (c: Coords, target: CrossTarget) => crossTable![crossKey(c)] === 0 && solvedPairs(c).length >= PAIR_COUNT[target];
/** A lower bound on the turns left: the cross's, and the pairs' (the target needs its `k` closest pairs at least). */
function bound(c: Coords, target: CrossTarget): number {
  const cross = crossTable![crossKey(c)]!, k = PAIR_COUNT[target];
  if (!k) return cross;
  const pairs = pairTables!.map((t, i) => t[pairKey(i)(c)]!).sort((a, b) => a - b);
  return Math.max(cross, pairs[k - 1]!);
}
/** Depth-first search for solutions of exactly `depth` turns; `visit` gets each path and returns true to stop. */
function search(c: Coords, target: CrossTarget, depth: number, visit: (path: number[], end: Coords) => boolean, path: number[] = [], previous = -1): boolean {
  if (!depth) return solved(c, target) && visit(path, c);
  if (bound(c, target) > depth) return false;
  for (let m = 0; m < 18; m++) {
    const face = MOVES[m]!.face;
    if (redundant(face, previous)) continue;
    path.push(m);
    const stop = search(turn(c, m), target, depth - 1, visit, path, face);
    path.pop();
    if (stop) return true;
  }
  return false;
}
/** Fewest face turns solving the target, searched up to `limit`. */
export function crossDistance(state: PatternData, target: CrossTarget, limit = 10): number | null {
  tables();
  const c = coordsOf(state);
  for (let depth = bound(c, target); depth <= limit; depth++) if (search(c, target, depth, () => true)) return depth;
  return null;
}

function shuffle<T>(values: T[], random: () => number): T[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return values;
}
const odd = (pieces: number[]) => pieces.reduce((sum, a, i) => sum + pieces.slice(i + 1).filter(b => b < a).length, 0) % 2 === 1;
/** A random cube whose target is solved: the cross and, for an XCross or XXCross, as many random pairs. */
function targetSolvedState(target: CrossTarget, random: () => number): PatternData {
  const pairs = shuffle([...PAIRS], random).slice(0, PAIR_COUNT[target]);
  const fixedEdges = [...CROSS_EDGES, ...pairs.map(p => p.edge)], fixedCorners: number[] = pairs.map(p => p.corner);
  const freeEdges = [...Array(12).keys()].filter(i => !fixedEdges.includes(i));
  const freeCorners = [...Array(8).keys()].filter(i => !fixedCorners.includes(i));
  const edges = [...Array(12).keys()], corners = [...Array(8).keys()];
  shuffle([...freeEdges], random).forEach((piece, i) => { edges[freeEdges[i]!] = piece; });
  shuffle([...freeCorners], random).forEach((piece, i) => { corners[freeCorners[i]!] = piece; });
  // Edge and corner permutations must share their parity.
  if (odd(edges) !== odd(corners)) [edges[freeEdges[0]!], edges[freeEdges[1]!]] = [edges[freeEdges[1]!]!, edges[freeEdges[0]!]!];
  const edgeTwist = Array(12).fill(0), cornerTwist = Array(8).fill(0);
  freeEdges.forEach(i => { edgeTwist[i] = Math.floor(random() * 2); });
  freeCorners.forEach(i => { cornerTwist[i] = Math.floor(random() * 3); });
  // Orientations must add up to zero: the last free piece takes what is left.
  edgeTwist[freeEdges.at(-1)!] = (2 - edgeTwist.reduce((a, b) => a + b, 0) % 2 + edgeTwist[freeEdges.at(-1)!]) % 2;
  cornerTwist[freeCorners.at(-1)!] = (3 - cornerTwist.reduce((a, b) => a + b, 0) % 3 + cornerTwist[freeCorners.at(-1)!]) % 3;
  return {
    EDGES: { pieces: edges, orientation: edgeTwist },
    CORNERS: { pieces: corners, orientation: cornerTwist },
    CENTERS: { pieces: [0, 1, 2, 3, 4, 5], orientation: [0, 0, 0, 0, 0, 0] },
  };
}
/** A random state whose best target is exactly `moves` face turns away. */
export function crossPattern(target: CrossTarget, moves: number, random = Math.random): PatternData {
  for (;;) {
    let state = targetSolvedState(target, random), previous = -1;
    for (let i = 0; i < moves; i++) {
      const choices = MOVES.filter(move => !redundant(move.face, previous));
      const move = choices[Math.floor(random() * choices.length)]!;
      state = apply(state, move);
      previous = move.face;
    }
    if (crossDistance(state, target, moves) === moves) return state;
  }
}

const FACE_NAMES = "UDRLFB";
const SUFFIXES = ["", "2", "'"];
const MOVE_NAMES = MOVES.map((move, i) => FACE_NAMES[move.face]! + SUFFIXES[i % 3]);
/** The cube after a scramble of face turns (no rotations or slices, as these scrambles are). */
export function patternAfter(scramble: string): PatternData {
  let state: PatternData = {
    EDGES: { pieces: [...Array(12).keys()], orientation: Array(12).fill(0) },
    CORNERS: { pieces: [...Array(8).keys()], orientation: Array(8).fill(0) },
    CENTERS: { pieces: [0, 1, 2, 3, 4, 5], orientation: [0, 0, 0, 0, 0, 0] },
  };
  for (const token of scramble.trim().split(/\s+/).filter(Boolean)) {
    const name = token.replace(/2'$/, "2"), index = MOVE_NAMES.indexOf(name);
    if (index < 0) throw new Error(`Unsupported move ${token}.`);
    state = apply(state, MOVES[index]!);
  }
  return state;
}
/**
 * Optimal solutions of a scramble's target, at most `limit` of them and different pairs first, written in the
 * scramble orientation (white on U); `heldMoves` rewrites them for the cube held with white on the bottom. `slot`
 * names the pairs each one solves along with the cross (empty for a plain cross).
 */
export function crossSolutions(scramble: string, target: CrossTarget, limit = 4, maxDepth = 10): { moves: string; slot: string }[] {
  tables();
  const start = coordsOf(patternAfter(scramble)), found: { moves: string; slot: string }[] = [], k = PAIR_COUNT[target];
  for (let depth = bound(start, target); depth <= maxDepth && !found.length; depth++)
    search(start, target, depth, (path, end) => {
      const moves = path.map(i => MOVE_NAMES[i]).join(" "), pairs = solvedPairs(end);
      // Each choice of `k` solved pairs is a different block; a plain cross names none.
      const choices = k === 2 ? pairs.flatMap((a, i) => pairs.slice(i + 1).map(b => [a, b])) : k ? pairs.map(a => [a]) : [[]];
      for (const choice of choices) found.push({ moves, slot: choice.map(i => PAIRS[i]!.slot).join(" + ") });
      return found.length >= limit * 3;
    });
  // Prefer showing different slots before repeating one.
  const first = found.filter((f, i) => found.findIndex(g => g.slot === f.slot) === i);
  return [...first, ...found.filter(f => !first.includes(f))].slice(0, limit);
}
/** Face turns seen with the cube turned over with z2 (white on the bottom, green still in front): U and D swap, R and L swap. */
export const heldMoves = (moves: string) => moves.replace(/[UDRL]/g, face => ({ U: "D", D: "U", R: "L", L: "R" })[face]!);
