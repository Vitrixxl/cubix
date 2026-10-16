import type { CubeMask } from "./cubeAppearance";
import { attemptMode, type SolveMode } from "./puzzles";

/**
 * Step practice on the 3×3, as csTimer's step scrambles: a random state where one step of a method is left to solve,
 * the cube held with white on the bottom and green in front (z2). A step with a solver (the cross, an EOLine, a
 * first block…) comes at exactly `moves` face turns, its optimal solutions revealed on demand; a later step (F2L,
 * the last layer…) is a random state of the pieces it solves, the others solved. A 3×3 solver turns the state into
 * a scramble.
 *
 * States use cubing.js's 3×3 pattern layout: position i holds piece `pieces[i]` with `orientation[i]`.
 * Edges: UF UR UB UL DF DR DB DL FR FL BR BL. Corners: UFR URB UBL ULF DRF DFL DLB DBR. White is on U, so the held
 * bottom is U, the held left is R: held DF is UF (0), DL UR (1), DB UB (2), DR UL (3), FL FR (8), FR FL (9), BL BR
 * (10), BR BL (11); held DFL is UFR (0), DLB URB (1), DBR UBL (2), DRF ULF (3).
 */

export type Orbit = { pieces: number[]; orientation: number[] };
export type PatternData = { EDGES: Orbit; CORNERS: Orbit; CENTERS: Orbit };
type Move = { face: number; edges: [number[], number[]]; corners: [number[], number[]] };
/** Pieces by their solved position, and `eo` for every edge oriented (on the F/B axis, as ZZ reads it). */
type Pieces = { edges?: number[]; corners?: number[]; eo?: boolean };
type Spec = {
  label: string;
  method: (typeof CROSS_METHODS)[number];
  /** The move counts offered, the middle one by default; none for a random state. */
  moves: readonly number[];
  mask: CubeMask;
  /** Solved before the step and never turned by its scramble's random moves. */
  given?: Pieces;
  /** The step's pieces, in groups of at most four, each a pruning table; none for a step without a solver. */
  goal?: Pieces[];
  /** F2L pairs to solve along with the goal, any of the four. */
  pairs?: number;
};

const CROSS: Pieces = { edges: [0, 1, 2, 3] };
const FIRST_BLOCK: Pieces = { edges: [1, 8, 10], corners: [0, 1] };
/** The first block's groups: its edges with either corner. */
const FIRST_BLOCK_GOAL: Pieces[] = [{ edges: [1, 8, 10], corners: [0] }, { edges: [1, 8, 10], corners: [1] }];
const BLOCKS: Pieces = { edges: [1, 8, 10, 3, 9, 11], corners: [0, 1, 2, 3] };
const BLOCK_222: Pieces = { edges: [1, 2, 10], corners: [1] };
const F2L: Pieces = { edges: [0, 1, 2, 3, 8, 9, 10, 11], corners: [0, 1, 2, 3] };
export const CROSS_METHODS = ["CFOP", "ZZ", "Roux", "Petrus"] as const;
const SPECS = {
  cross: { label: "Cross", method: "CFOP", moves: [4, 5, 6], mask: "cross", goal: [CROSS] },
  xcross: { label: "XCross", method: "CFOP", moves: [5, 6, 7], mask: "F2L", goal: [CROSS], pairs: 1 },
  xxcross: { label: "XXCross", method: "CFOP", moves: [6, 7, 8], mask: "F2L", goal: [CROSS], pairs: 2 },
  "f2l-only": { label: "F2L", method: "CFOP", moves: [], mask: "F2L", given: CROSS },
  // The last slot is the front right one, as csTimer has it.
  lsll: { label: "LSLL", method: "CFOP", moves: [], mask: "full", given: { edges: [0, 1, 2, 3, 8, 10, 11], corners: [0, 1, 2] } },
  ll: { label: "Last layer", method: "CFOP", moves: [], mask: "full", given: F2L },
  eoline: { label: "EOLine", method: "ZZ", moves: [5, 6, 7], mask: "edges", goal: [{ eo: true, edges: [0, 2] }] },
  eocross: { label: "EOCross", method: "ZZ", moves: [6, 7, 8], mask: "edges", goal: [{ eo: true, edges: [0, 2] }, { eo: true, edges: [1, 3] }, CROSS] },
  zbll: { label: "ZBLL", method: "ZZ", moves: [], mask: "full", given: { ...F2L, eo: true } },
  fb: { label: "First block", method: "Roux", moves: [6, 7, 8], mask: "FB", goal: FIRST_BLOCK_GOAL },
  // A random state (its best solutions take 8 to 12 turns, too many to draw by count): the first block's groups, and
  // the second block's two corners with two of its edges.
  sb: {
    label: "Second block", method: "Roux", moves: [], mask: "blocks", given: FIRST_BLOCK,
    goal: [...FIRST_BLOCK_GOAL, { edges: [3, 9], corners: [3, 2] }, { edges: [3, 11], corners: [3, 2] }, { edges: [9, 11], corners: [3, 2] }],
  },
  cmll: { label: "CMLL", method: "Roux", moves: [], mask: "CMLL", given: BLOCKS },
  "2x2x2": { label: "2×2×2", method: "Petrus", moves: [5, 6, 7], mask: "2x2x2", goal: [BLOCK_222] },
  // From the 2×2×2: its pieces with the block's, and the front ones in two groups.
  "2x2x3": { label: "2×2×3", method: "Petrus", moves: [5, 6, 7], mask: "2x2x3", given: BLOCK_222, goal: [BLOCK_222, { edges: [0, 1, 8], corners: [0] }, { edges: [0, 2, 8], corners: [0] }] },
} satisfies Record<string, Spec>;
export type CrossTarget = keyof typeof SPECS;
export const CROSS_TARGETS = Object.keys(SPECS) as CrossTarget[];
const spec = (target: CrossTarget): Spec => SPECS[target];
export const CROSS_TARGET_LABELS = Object.fromEntries(CROSS_TARGETS.map(t => [t, spec(t).label])) as Record<CrossTarget, string>;
/** The chooser's choices, method by method (`group`). */
export const CROSS_OPTIONS = CROSS_TARGETS.map(t => ({ id: t, label: spec(t).label, group: spec(t).method }));
/** The move counts offered per target, the middle one by default; none for a random state. */
export const CROSS_MOVES = Object.fromEntries(CROSS_TARGETS.map(t => [t, spec(t).moves])) as Record<CrossTarget, readonly number[]>;
/** What the cube picture colours: the step's pieces, the others grey. */
export const crossMask = (target: CrossTarget): CubeMask => spec(target).mask;
/** Whether the step's optimal solutions can be revealed. */
export const hasSolutions = (target: CrossTarget) => !!spec(target).goal;
/** The solve mode a step is timed in: Fewest Moves and Multi-Blind are no timed solves, the standard mode stands in. */
export const crossSolveMode = <M extends string>(mode: M): M | SolveMode => (attemptMode(mode) ? "standard" : mode);
export const isCrossTarget = (value: unknown): value is CrossTarget => CROSS_TARGETS.includes(value as CrossTarget);
/** The move count kept for a target: `moves` if it offers it, its middle one otherwise, 0 for a random state. */
export const crossMovesFor = (target: CrossTarget, moves: unknown) =>
  CROSS_MOVES[target].includes(moves as number) ? (moves as number) : CROSS_MOVES[target][1] ?? 0;
/** The scramble type of a target and move count, as `xcross-6`, or the target alone (`zbll`) for a random state. */
export const crossScrambleType = (target: CrossTarget, moves: number) => (CROSS_MOVES[target].length ? `${target}-${moves}` : target);
export const crossTrainingType = (type: string): { target: CrossTarget; moves: number } | null => {
  if (isCrossTarget(type)) return CROSS_MOVES[type].length ? null : { target: type, moves: 0 };
  const [, target, moves] = /^(.+)-(\d)$/.exec(type) ?? [];
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
/** The F2L pairs: corner and slot edge, with the slot's name once the cube is turned over with z2 (U↔D, R↔L). */
const PAIRS = [
  { corner: 0, edge: 8, slot: "FL" },
  { corner: 1, edge: 10, slot: "BL" },
  { corner: 2, edge: 11, slot: "BR" },
  { corner: 3, edge: 9, slot: "FR" },
] as const;

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
 * The search tracks only the pieces that matter, each as a coordinate `position × twists + orientation` (edges as
 * 0–11, corners as 12–19), and the twelve edges' flips as one mask. Turning a coordinate is a table lookup.
 */
const coordMoves = (index: 0 | 1, size: number, twists: number) => MOVES.map(move => {
  const [permutation, delta] = index ? move.corners : move.edges, table = new Int8Array(size * twists);
  permutation.forEach((from, to) => { for (let o = 0; o < twists; o++) table[from * twists + o] = to * twists + (o + delta[to]!) % twists; });
  return table;
});
const EDGE_MOVES = coordMoves(0, 12, 2), CORNER_MOVES = coordMoves(1, 8, 3);
/** The flips' mask after each turn: bit i is the edge at position i flipped. */
const FLIP_MOVES = MOVES.map(({ edges: [permutation, delta] }) => Uint16Array.from({ length: 4096 }, (_, mask) =>
  permutation.reduce((next, from, to) => next | ((((mask >> from) & 1) ^ delta[to]!) << to), 0)));
const pieceMoves = (piece: number) => (piece < 12 ? EDGE_MOVES : CORNER_MOVES);
const solvedValue = (piece: number) => (piece < 12 ? piece * 2 : (piece - 12) * 3);
const piecesOf = ({ edges = [], corners = [] }: Pieces) => [...edges, ...corners.map(c => c + 12)];

/** Breadth-first distances of a group of pieces (and the flips) to solved, by `[flips ×] 24 × … × 24`. */
function groupDistances(eo: boolean, pieces: number[]): Uint8Array {
  const table = new Uint8Array((eo ? 4096 : 1) * 24 ** pieces.length).fill(255), values = new Int32Array(pieces.length);
  const solved = pieces.reduce((key, p) => key * 24 + solvedValue(p), 0);
  let frontier = [solved];
  table[solved] = 0;
  for (let depth = 1; frontier.length; depth++) {
    const next: number[] = [];
    for (const key of frontier) {
      let rest = key;
      for (let i = pieces.length - 1; i >= 0; i--) { values[i] = rest % 24; rest = Math.floor(rest / 24); }
      for (let m = 0; m < 18; m++) {
        let n = eo ? FLIP_MOVES[m]![rest]! : 0;
        for (let i = 0; i < pieces.length; i++) n = n * 24 + pieceMoves(pieces[i]!)[m]![values[i]!]!;
        if (table[n] === 255) { table[n] = depth; next.push(n); }
      }
    }
    frontier = next;
  }
  return table;
}
const tables = new Map<string, Uint8Array>();
/** A pruning table: its pieces' places in the search state (the flips at 0), built on first use and shared. */
type Group = { at: number[]; eo: boolean; table: Uint8Array };
/** The search of a target: the pieces it tracks (state index − 1), its groups, and the pairs it needs `k` of. */
type Solver = { tracked: number[]; groups: Group[]; options: Group[]; k: number; slots: string[] };
const solvers = new Map<CrossTarget, Solver>();
function solverOf(target: CrossTarget): Solver {
  let solver = solvers.get(target);
  if (solver) return solver;
  const { goal = [], pairs = 0 } = spec(target), tracked: number[] = [];
  const group = (g: Pieces): Group => {
    const pieces = piecesOf(g), key = `${!!g.eo}|${pieces}`;
    for (const p of pieces) if (!tracked.includes(p)) tracked.push(p);
    if (!tables.has(key)) tables.set(key, groupDistances(!!g.eo, pieces));
    return { at: pieces.map(p => tracked.indexOf(p) + 1), eo: !!g.eo, table: tables.get(key)! };
  };
  const groups = goal.map(group), options = pairs ? PAIRS.map(p => group({ edges: [p.edge], corners: [p.corner] })) : [];
  solvers.set(target, (solver = { tracked, groups, options, k: pairs, slots: PAIRS.map(p => p.slot) }));
  return solver;
}
/** Search state: the flips' mask, then each tracked piece's coordinate. */
type Coords = Int16Array;
const turn = (solver: Solver, c: Coords, m: number): Coords => {
  const next = new Int16Array(c.length);
  next[0] = FLIP_MOVES[m]![c[0]!]!;
  for (let i = 1; i < c.length; i++) next[i] = pieceMoves(solver.tracked[i - 1]!)[m]![c[i]!]!;
  return next;
};
function coordsOf(solver: Solver, state: PatternData): Coords {
  const c = new Int16Array(solver.tracked.length + 1);
  c[0] = state.EDGES.orientation.reduce((mask, o, i) => mask | (o << i), 0);
  solver.tracked.forEach((piece, i) => {
    const orbit = piece < 12 ? state.EDGES : state.CORNERS, at = orbit.pieces.indexOf(piece < 12 ? piece : piece - 12);
    c[i + 1] = at * (piece < 12 ? 2 : 3) + orbit.orientation[at]!;
  });
  return c;
}
const distance = (g: Group, c: Coords) => g.table[g.at.reduce((key, i) => key * 24 + c[i]!, g.eo ? c[0]! : 0)]!;
const solvedOptions = (solver: Solver, c: Coords) => solver.options.flatMap((g, i) => (distance(g, c) ? [] : [i]));
const solved = (solver: Solver, c: Coords) => solver.groups.every(g => !distance(g, c)) && solvedOptions(solver, c).length >= solver.k;
/** A lower bound on the turns left: each group's, and the pairs' (the target needs its `k` closest pairs at least). */
function bound(solver: Solver, c: Coords): number {
  let most = 0;
  for (const g of solver.groups) most = Math.max(most, distance(g, c));
  if (!solver.k) return most;
  return Math.max(most, solver.options.map(g => distance(g, c)).sort((a, b) => a - b)[solver.k - 1]!);
}
/** Depth-first search for solutions of exactly `depth` turns; `visit` gets each path and returns true to stop. */
function search(solver: Solver, c: Coords, depth: number, visit: (path: number[], end: Coords) => boolean, path: number[] = [], previous = -1): boolean {
  if (!depth) return solved(solver, c) && visit(path, c);
  if (bound(solver, c) > depth) return false;
  for (let m = 0; m < 18; m++) {
    const face = MOVES[m]!.face;
    if (redundant(face, previous)) continue;
    path.push(m);
    const stop = search(solver, turn(solver, c, m), depth - 1, visit, path, face);
    path.pop();
    if (stop) return true;
  }
  return false;
}
/** Fewest face turns solving the target, searched up to `limit`; null for a target without a solver. */
export function crossDistance(state: PatternData, target: CrossTarget, limit = 10): number | null {
  if (!hasSolutions(target)) return null;
  const solver = solverOf(target), c = coordsOf(solver, state);
  for (let depth = bound(solver, c); depth <= limit; depth++) if (search(solver, c, depth, () => true)) return depth;
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
/** A random cube whose `fixed` pieces are solved (and every edge oriented for `eo`), the others anywhere. */
function randomState({ edges: fixedEdges = [], corners: fixedCorners = [], eo = false }: Pieces, random: () => number): PatternData {
  const freeEdges = [...Array(12).keys()].filter(i => !fixedEdges.includes(i));
  const freeCorners = [...Array(8).keys()].filter(i => !fixedCorners.includes(i));
  const edges = [...Array(12).keys()], corners = [...Array(8).keys()];
  shuffle([...freeEdges], random).forEach((piece, i) => { edges[freeEdges[i]!] = piece; });
  shuffle([...freeCorners], random).forEach((piece, i) => { corners[freeCorners[i]!] = piece; });
  // Edge and corner permutations must share their parity.
  if (odd(edges) !== odd(corners)) [edges[freeEdges[0]!], edges[freeEdges[1]!]] = [edges[freeEdges[1]!]!, edges[freeEdges[0]!]!];
  const edgeTwist = Array(12).fill(0), cornerTwist = Array(8).fill(0);
  if (!eo) freeEdges.forEach(i => { edgeTwist[i] = Math.floor(random() * 2); });
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
const merge = (...all: Pieces[]): Pieces => ({
  edges: all.flatMap(p => p.edges ?? []), corners: all.flatMap(p => p.corners ?? []), eo: all.some(p => p.eo),
});
/** Whether a face's turns leave these pieces where they are. */
const keeps = (face: number, { edges = [], corners = [] }: Pieces) => {
  const { edges: [ep, eo], corners: [cp, co] } = MOVES[face * 3]!;
  return edges.every(e => ep[e] === e && !eo[e]) && corners.every(c => cp[c] === c && !co[c]);
};
/**
 * A random state where the target is left to solve: for a target with move counts, its best solution exactly `moves`
 * face turns long (turns of the faces that keep its given pieces, from a random state where it is solved); else a
 * random state of the pieces it solves, the given ones solved.
 */
export function crossPattern(target: CrossTarget, moves: number, random = Math.random): PatternData {
  const { given = {}, goal, pairs = 0 } = spec(target);
  if (!goal || !CROSS_MOVES[target].length) return randomState(given, random);
  const choices = MOVES.filter(move => keeps(move.face, given));
  for (;;) {
    const solvedPairs = shuffle([...PAIRS], random).slice(0, pairs).map(p => ({ edges: [p.edge], corners: [p.corner] }));
    let state = randomState(merge(given, ...goal, ...solvedPairs), random), previous = -1;
    for (let i = 0; i < moves; i++) {
      const allowed = choices.filter(move => !redundant(move.face, previous));
      const move = allowed[Math.floor(random() * allowed.length)]!;
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
 * names the pairs each one solves along with the cross (empty for a step without pairs). None for a target without
 * a solver.
 */
export function crossSolutions(scramble: string, target: CrossTarget, limit = 4, maxDepth = 12): { moves: string; slot: string }[] {
  if (!hasSolutions(target)) return [];
  const solver = solverOf(target), start = coordsOf(solver, patternAfter(scramble)), found: { moves: string; slot: string }[] = [], k = solver.k;
  for (let depth = bound(solver, start); depth <= maxDepth && !found.length; depth++)
    search(solver, start, depth, (path, end) => {
      const moves = path.map(i => MOVE_NAMES[i]).join(" "), pairs = solvedOptions(solver, end);
      // Each choice of `k` solved pairs is a different block; a step without pairs names none.
      const choices = k === 2 ? pairs.flatMap((a, i) => pairs.slice(i + 1).map(b => [a, b])) : k ? pairs.map(a => [a]) : [[]];
      for (const choice of choices) found.push({ moves, slot: choice.map(i => solver.slots[i]!).join(" + ") });
      return found.length >= limit * 3;
    });
  // Prefer showing different slots before repeating one.
  const first = found.filter((f, i) => found.findIndex(g => g.slot === f.slot) === i);
  return [...first, ...found.filter(f => !first.includes(f))].slice(0, limit);
}
/** Face turns seen with the cube turned over with z2 (white on the bottom, green still in front): U and D swap, R and L swap. */
export const heldMoves = (moves: string) => moves.replace(/[UDRL]/g, face => ({ U: "D", D: "U", R: "L", L: "R" })[face]!);
