import { describe, expect, test } from "bun:test";
import { cube3x3x3 } from "cubing/puzzles";
import { CROSS_MOVES, CROSS_TARGETS, crossDistance, crossPattern, crossScrambleType, crossSolutions, crossTrainingType, hasSolutions, patternAfter, type CrossTarget, type PatternData } from "../src/shared/crossTraining";
import { GREY, stickerColors, type CubeMask } from "../src/shared/cubeAppearance";
import { solved } from "../src/shared/cube";
import { generatePracticeScramble } from "../src/client/lib/practiceScrambleCore";
import { scrambler } from "./scrambler";

/*
 * Each step's pieces, written again here from the held cube (white on the bottom, green in front: z2 from the
 * scramble's white on U), so the generator is checked against an independent reading.
 * Edges UF UR UB UL DF DR DB DL FR FL BR BL; corners UFR URB UBL ULF DRF DFL DLB DBR.
 */
type Pieces = { e?: number[]; c?: number[]; eo?: boolean };
const CROSS = [0, 1, 2, 3], FB: Pieces = { e: [1, 8, 10], c: [0, 1] }, F2L: Pieces = { e: [...CROSS, 8, 9, 10, 11], c: [0, 1, 2, 3] };
const B222: Pieces = { e: [1, 2, 10], c: [1] };
/** What each target leaves solved before the step (its random part is the rest). */
const GIVEN: Partial<Record<CrossTarget, Pieces>> = {
  "f2l-only": { e: CROSS }, lsll: { e: [...CROSS, 8, 10, 11], c: [0, 1, 2] }, ll: F2L, zbll: { ...F2L, eo: true },
  sb: FB, cmll: { e: [1, 8, 10, 3, 9, 11], c: [0, 1, 2, 3] }, "2x2x3": B222,
};
/** What each target with a solver solves, and the F2L pairs it needs along. */
const GOAL: Partial<Record<CrossTarget, Pieces & { pairs?: number }>> = {
  cross: { e: CROSS }, xcross: { e: CROSS, pairs: 1 }, xxcross: { e: CROSS, pairs: 2 }, eoline: { e: [0, 2], eo: true }, eocross: { e: CROSS, eo: true },
  fb: FB, sb: { e: [1, 8, 10, 3, 9, 11], c: [0, 1, 2, 3] }, "2x2x2": B222, "2x2x3": { e: [0, 1, 2, 8, 10], c: [0, 1] },
};
const at = (o: { pieces: number[]; orientation: number[] }, i: number) => o.pieces[i] === i && o.orientation[i] === 0;
const holds = (s: PatternData, { e = [], c = [], eo }: Pieces) =>
  e.every(i => at(s.EDGES, i)) && c.every(i => at(s.CORNERS, i)) && (!eo || s.EDGES.orientation.every(o => !o));
const pairs = (s: PatternData) => [[0, 8], [1, 10], [2, 11], [3, 9]].filter(([c, e]) => at(s.CORNERS, c!) && at(s.EDGES, e!)).length;
const done = (s: PatternData, target: CrossTarget) => holds(s, GOAL[target]!) && pairs(s) >= (GOAL[target]!.pairs ?? 0);
const odd = (pieces: number[]) => pieces.reduce((sum, a, i) => sum + pieces.slice(i + 1).filter(b => b < a).length, 0) % 2 === 1;
const legal = (s: PatternData) =>
  new Set(s.EDGES.pieces).size === 12 && new Set(s.CORNERS.pieces).size === 8 && odd(s.EDGES.pieces) === odd(s.CORNERS.pieces)
  && s.EDGES.orientation.reduce((a, b) => a + b, 0) % 2 === 0 && s.CORNERS.orientation.reduce((a, b) => a + b, 0) % 3 === 0;
/** A seeded generator (mulberry32), so every run draws the same states. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const FACE_TURNS = [..."UDRLFB"].flatMap(f => [f, f + "2", f + "'"]);
/** Whether cubing.js's own cube solves the target from `scramble` in `depth` face turns or fewer, trying them all. */
async function solvableWithin(scramble: string, target: CrossTarget, depth: number) {
  const kpuzzle = await cube3x3x3.kpuzzle();
  const visit = (pattern: ReturnType<typeof kpuzzle.defaultPattern>, left: number, previous: string): boolean => {
    if (done(pattern.patternData as unknown as PatternData, target)) return true;
    return !!left && FACE_TURNS.some(m => m[0] !== previous && visit(pattern.applyMove(m), left - 1, m[0]!));
  };
  return visit(kpuzzle.defaultPattern().applyAlg(scramble), depth, "");
}

describe("step training", () => {
  test("reads its scramble types only", () => {
    expect(crossTrainingType("eoline-6")).toEqual({ target: "eoline", moves: 6 });
    expect(crossTrainingType("2x2x3-5")).toEqual({ target: "2x2x3", moves: 5 });
    expect(crossTrainingType("zbll")).toEqual({ target: "zbll", moves: 0 });
    expect(crossTrainingType("f2l-only")).toEqual({ target: "f2l-only", moves: 0 });
    for (const type of ["eoline", "zbll-3", "fb-2", "f2l", "last-layer", "sb-9"]) expect(crossTrainingType(type)).toBeNull();
    for (const target of CROSS_TARGETS) for (const n of CROSS_MOVES[target].length ? CROSS_MOVES[target] : [0])
      expect(crossTrainingType(crossScrambleType(target, n))).toEqual({ target, moves: n });
  });

  for (const target of CROSS_TARGETS) test(`${target}: the scramble leaves exactly the step to solve`, async () => {
    const random = seeded(CROSS_TARGETS.indexOf(target) + 1);
    for (const moves of CROSS_MOVES[target].length ? CROSS_MOVES[target] : [0]) for (let i = 0; i < 3; i++) {
      const state = crossPattern(target, moves, random);
      expect(legal(state)).toBe(true);
      if (GIVEN[target]) expect(holds(state, GIVEN[target]!)).toBe(true);
      if (GOAL[target]) expect(done(state, target)).toBe(false);
      if (moves) expect(crossDistance(state, target)).toBe(moves);
      // Not solved whole, the step's random part never left solved.
      expect(holds(state, { e: [...Array(12).keys()], c: [...Array(8).keys()] })).toBe(false);
      // The scramble the app shows reaches this state.
      expect(patternAfter(await scrambler.patternScramble(state))).toEqual(state);
    }
  });

  test("the app's generator draws every step's scramble type", async () => {
    for (const target of CROSS_TARGETS) {
      const moves = CROSS_MOVES[target][0] ?? 0, scramble = await generatePracticeScramble({ puzzle: "333", solveMode: "standard", scrambleType: crossScrambleType(target, moves) as never }, scrambler);
      const state = patternAfter(scramble);
      if (GIVEN[target]) expect(holds(state, GIVEN[target]!)).toBe(true);
      if (moves) expect(crossDistance(state, target)).toBe(moves);
    }
  }, 30000);

  for (const target of CROSS_TARGETS.filter(hasSolutions)) test(`${target}: revealed solutions solve the step, optimally`, async () => {
    const random = seeded(100 + CROSS_TARGETS.indexOf(target));
    const moves = CROSS_MOVES[target][0] ?? 0, state = crossPattern(target, moves, random), scramble = await scrambler.patternScramble(state);
    const solutions = crossSolutions(scramble, target), best = crossDistance(state, target, 12)!;
    expect(solutions.length).toBeGreaterThan(0);
    if (moves) expect(best).toBe(moves);
    for (const { moves: solution } of solutions) {
      expect(solution.split(" ").length).toBe(best);
      expect(done(patternAfter(`${scramble} ${solution}`), target)).toBe(true);
    }
    // No shorter solution, every sequence of face turns tried by cubing.js's cube (short enough to try them all).
    if (best <= 5) expect(await solvableWithin(scramble, target, best - 1)).toBe(false);
  }, 60000);
  test("the picture colours the blocks' stickers alone", () => {
    // Held cube: the first block on the left, the 2×2×2 at the back left, the 2×2×3 on the left, centres included.
    const coloured = (mask: CubeMask) => stickerColors(solved(), mask, true).filter(c => c !== GREY).length;
    expect([coloured("FB"), coloured("2x2x2"), coloured("2x2x3")]).toEqual([13, 12, 20]);
  });
  test("random-state steps have no solution to reveal", () => {
    for (const target of ["f2l-only", "lsll", "ll", "zbll", "cmll"] as const) {
      expect(hasSolutions(target)).toBe(false);
      expect(crossSolutions("R U", target)).toEqual([]);
    }
  });
});
