import { describe, expect, test } from "bun:test";
import { CROSS_PLUS_ONE_MOVES, crossPlusOneDistance, crossPlusOneMoves, crossPlusOnePattern, crossPlusOneSolved } from "../src/shared/crossPlusOne";

const odd = (pieces: number[]) => pieces.reduce((sum, a, i) => sum + pieces.slice(i + 1).filter(b => b < a).length, 0) % 2 === 1;

describe("cross + 1 scrambles", () => {
  test("reads the move count of its scramble types only", () => {
    expect(CROSS_PLUS_ONE_MOVES.map(n => crossPlusOneMoves(`cross1-${n}`))).toEqual([3, 4, 5]);
    expect(crossPlusOneMoves("cross1-2")).toBeNull();
    expect(crossPlusOneMoves("cross1-6")).toBeNull();
    expect(crossPlusOneMoves("normal")).toBeNull();
  });
  test("the solved cube has its cross and pairs solved", () => {
    const solved = { EDGES: { pieces: [...Array(12).keys()], orientation: Array(12).fill(0) }, CORNERS: { pieces: [...Array(8).keys()], orientation: Array(8).fill(0) }, CENTERS: { pieces: [0, 1, 2, 3, 4, 5], orientation: Array(6).fill(0) } };
    expect(crossPlusOneSolved(solved)).toBe(true);
    expect(crossPlusOneDistance(solved)).toBe(0);
  });
  for (const moves of CROSS_PLUS_ONE_MOVES) test(`the best cross + 1 takes exactly ${moves} moves on a legal cube`, () => {
    for (let i = 0; i < 8; i++) {
      const state = crossPlusOnePattern(moves);
      expect(crossPlusOneDistance(state)).toBe(moves);
      expect(new Set(state.EDGES.pieces).size).toBe(12);
      expect(new Set(state.CORNERS.pieces).size).toBe(8);
      expect(state.EDGES.orientation.reduce((a, b) => a + b, 0) % 2).toBe(0);
      expect(state.CORNERS.orientation.reduce((a, b) => a + b, 0) % 3).toBe(0);
      expect(odd(state.EDGES.pieces)).toBe(odd(state.CORNERS.pieces));
    }
  });
});
