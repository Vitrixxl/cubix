import { describe, expect, test } from "bun:test";
import { CROSS_MOVES, CROSS_TARGETS, crossDistance, crossPattern, crossSolutions, crossTrainingType, patternAfter, type PatternData } from "../src/shared/crossTraining";

const odd = (pieces: number[]) => pieces.reduce((sum, a, i) => sum + pieces.slice(i + 1).filter(b => b < a).length, 0) % 2 === 1;
const SOLVED: PatternData = { EDGES: { pieces: [...Array(12).keys()], orientation: Array(12).fill(0) }, CORNERS: { pieces: [...Array(8).keys()], orientation: Array(8).fill(0) }, CENTERS: { pieces: [0, 1, 2, 3, 4, 5], orientation: Array(6).fill(0) } };
const at = (o: { pieces: number[]; orientation: number[] }, i: number) => o.pieces[i] === i && o.orientation[i] === 0;
/** Pairs solved with the cross, read on the full cube. */
const pairsSolved = (s: PatternData) => [[0, 8], [1, 10], [2, 11], [3, 9]].filter(([c, e]) => at(s.CORNERS, c!) && at(s.EDGES, e!)).length;
const crossSolved = (s: PatternData) => [0, 1, 2, 3].every(e => at(s.EDGES, e));

describe("cross training scrambles", () => {
  test("reads its scramble types only", () => {
    expect(crossTrainingType("xcross-6")).toEqual({ target: "xcross", moves: 6 });
    expect(crossTrainingType("cross-4")).toEqual({ target: "cross", moves: 4 });
    expect(crossTrainingType("xxcross-8")).toEqual({ target: "xxcross", moves: 8 });
    expect(crossTrainingType("cross-8")).toBeNull();
    expect(crossTrainingType("cross1-4")).toBeNull();
    expect(crossTrainingType("normal")).toBeNull();
  });
  test("the solved cube is solved for every target", () => {
    for (const target of CROSS_TARGETS) expect(crossDistance(SOLVED, target)).toBe(0);
  });
  for (const target of CROSS_TARGETS) for (const moves of CROSS_MOVES[target]) test(`the best ${target} takes exactly ${moves} moves on a legal cube`, () => {
    for (let i = 0; i < 4; i++) {
      const state = crossPattern(target, moves);
      expect(crossDistance(state, target)).toBe(moves);
      expect(new Set(state.EDGES.pieces).size).toBe(12);
      expect(new Set(state.CORNERS.pieces).size).toBe(8);
      expect(state.EDGES.orientation.reduce((a, b) => a + b, 0) % 2).toBe(0);
      expect(state.CORNERS.orientation.reduce((a, b) => a + b, 0) % 3).toBe(0);
      expect(odd(state.EDGES.pieces)).toBe(odd(state.CORNERS.pieces));
    }
  });
  test("solutions solve their target and name the pairs they build", () => {
    const scramble = "L F2 D' R' F R2 F L' D F2 D2 B' R2 B2 L2 U2 F' U2 L2 F L2";
    for (const [target, pairs] of [["cross", 0], ["xcross", 1], ["xxcross", 2]] as const) {
      const solutions = crossSolutions(scramble, target);
      expect(solutions.length).toBeGreaterThan(0);
      for (const { moves, slot } of solutions) {
        const end = patternAfter(`${scramble} ${moves}`);
        expect(crossSolved(end)).toBe(true);
        expect(pairsSolved(end)).toBeGreaterThanOrEqual(pairs);
        expect(slot ? slot.split(" + ").length : 0).toBe(pairs);
      }
    }
  });
});
