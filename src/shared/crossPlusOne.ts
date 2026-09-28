/**
 * First-block practice on the 3×3 ("cross + 1"): a random state whose best back block takes exactly `moves` face turns.
 * The block is a 2×2×2: a back F2L pair with its two cross edges, the cube held with white on the bottom and green in
 * front (z2). The other cross edges and the rest of the cube are random; a 3×3 solver turns the state into a scramble.
 *
 * States use cubing.js's 3×3 pattern layout: position i holds piece `pieces[i]` with `orientation[i]`.
 * Edges: UF UR UB UL DF DR DB DL FR FL BR BL. Corners: UFR URB UBL ULF DRF DFL DLB DBR. White is on U.
 */
export type Orbit = { pieces: number[]; orientation: number[] };
export type PatternData = { EDGES: Orbit; CORNERS: Orbit; CENTERS: Orbit };
type Move = { face: number; edges: [number[], number[]]; corners: [number[], number[]] };

export const CROSS_PLUS_ONE_MOVES = [3, 4, 5] as const;
export const crossPlusOneMoves = (type: string): number | null => {
  const moves = /^cross1-(\d)$/.exec(type)?.[1];
  return moves && CROSS_PLUS_ONE_MOVES.includes(Number(moves) as 3) ? Number(moves) : null;
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
/**
 * The back blocks, in the scramble orientation (white on U, green in front), with the name of their slot once the
 * cube is turned over with z2: corner, slot edge and the two cross edges beside them. BL here is BR in hand, BR is BL.
 */
const BLOCKS = [
  { corner: 2, edges: [11, 2, 3], slot: "BR" },
  { corner: 1, edges: [10, 2, 1], slot: "BL" },
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

const solvedPiece = (orbit: Orbit, i: number) => orbit.pieces[i] === i && orbit.orientation[i] === 0;
const blockSolved = (state: PatternData, block: (typeof BLOCKS)[number]) =>
  solvedPiece(state.CORNERS, block.corner) && block.edges.every(edge => solvedPiece(state.EDGES, edge));
/** At least one back block (a back pair and its two cross edges) is solved. */
export function crossPlusOneSolved(state: PatternData): boolean {
  return BLOCKS.some(block => blockSolved(state, block));
}
/** Skip a turn of the previous face, and of its opposite face in one fixed order, as they never shorten a solution. */
const redundant = (face: number, previous: number) => face === previous || (face >> 1 === previous >> 1 && face < previous);
/** Whether a back block can be solved within `depth` face turns. */
function solvableWithin(state: PatternData, depth: number, previous = -1): boolean {
  if (crossPlusOneSolved(state)) return true;
  if (!depth) return false;
  return MOVES.some(move => !redundant(move.face, previous) && solvableWithin(apply(state, move), depth - 1, move.face));
}
/** Fewest face turns solving a back block, searched up to `limit`. */
export function crossPlusOneDistance(state: PatternData, limit = 6): number | null {
  for (let depth = 0; depth <= limit; depth++) if (solvableWithin(state, depth)) return depth;
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
/** A random cube whose back block is solved. */
function blockSolvedState(random: () => number): PatternData {
  const { corner, edges: fixedEdges } = BLOCKS[Math.floor(random() * BLOCKS.length)]!;
  const freeEdges = [...Array(12).keys()].filter(i => !(fixedEdges as readonly number[]).includes(i));
  const freeCorners = [...Array(8).keys()].filter(i => i !== corner);
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
/** A random state whose best back block is exactly `moves` face turns away. */
export function crossPlusOnePattern(moves: number, random = Math.random): PatternData {
  for (;;) {
    let state = blockSolvedState(random), previous = -1;
    for (let i = 0; i < moves; i++) {
      const choices = MOVES.filter(move => !redundant(move.face, previous));
      const move = choices[Math.floor(random() * choices.length)]!;
      state = apply(state, move);
      previous = move.face;
    }
    if (!solvableWithin(state, moves - 1)) return state;
  }
}

const FACE_NAMES = "UDRLFB";
const SUFFIXES = ["", "2", "'"];
const MOVE_NAMES = MOVES.map((move, i) => FACE_NAMES[move.face]! + SUFFIXES[i % 3]);
/** The cube after a scramble of face turns (no rotations or slices, as the cross + 1 scrambles are). */
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
/** The blocks a state has solved, named as in hand (z2): BR or BL. */
const solvedSlots = (state: PatternData) => BLOCKS.filter(block => blockSolved(state, block)).map(block => block.slot);
/**
 * Optimal back-block solutions of a scramble, at most `limit` of them and one per block first, written in the
 * scramble orientation (white on U); `heldMoves` rewrites them for the cube held with white on the bottom.
 */
export function crossPlusOneSolutions(scramble: string, limit = 4, maxDepth = 6): { moves: string; slot: string }[] {
  const start = patternAfter(scramble), found: { moves: string; slot: string }[] = [], path: number[] = [];
  const search = (state: PatternData, depth: number, previous: number): void => {
    if (found.length >= limit * 3) return;
    if (!depth) {
      if (!crossPlusOneSolved(state)) return;
      for (const slot of solvedSlots(state)) found.push({ moves: path.map(i => MOVE_NAMES[i]).join(" "), slot });
      return;
    }
    MOVES.forEach((move, i) => {
      if (redundant(move.face, previous)) return;
      path.push(i);
      search(apply(state, move), depth - 1, move.face);
      path.pop();
    });
  };
  for (let depth = 0; depth <= maxDepth && !found.length; depth++) search(start, depth, -1);
  // Prefer showing different slots before repeating one.
  const bySlot = [...found.filter((f, i) => found.findIndex(g => g.slot === f.slot) === i), ...found.filter((f, i) => found.findIndex(g => g.slot === f.slot) !== i)];
  return bySlot.slice(0, limit);
}
/** Face turns seen with the cube turned over with z2 (white on the bottom, green still in front): U and D swap, R and L swap. */
export const heldMoves = (moves: string) => moves.replace(/[UDRL]/g, face => ({ U: "D", D: "U", R: "L", L: "R" })[face]!);
