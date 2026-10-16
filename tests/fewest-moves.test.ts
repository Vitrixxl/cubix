import { expect, test } from "bun:test";
import { fmcResult, readFmcSolution } from "../src/client/lib/fewestMoves";
import { mbldValue, numberedScrambles, scrambleList, wcaResult } from "../src/client/lib/wca";
import { fmtSolveOf, resultFields, solveResult } from "../src/client/lib/format";
import { sessionFigures, shownFigures } from "../src/client/lib/practiceSummary";
import { invertAlg } from "../src/shared/cube";

const SCRAMBLE = "R' U' F D2 L2 B' R2 F U2 R' U' F";

test("a written solution is read as a delegate reads it (WCA E2c, 12a)", () => {
  // Case corrected (r is R), other symbols ignored, R2' read R2, rotations free in OBTM, wide turns one move.
  expect(readFmcSolution("r U2' (F) x Rw' 2Fw y2")).toEqual({ turns: ["R", "U2", "F", "x", "Rw'", "Fw", "y2"], moves: 5, etm: 7 });
  expect(readFmcSolution("RUR'U'")).toMatchObject({ moves: 4 });
  expect(readFmcSolution("R M U")).toEqual({ error: "No slice moves: M" });
  expect(readFmcSolution("R3")).toMatchObject({ error: "Not WCA notation: 3" });
  expect(readFmcSolution("2R")).toMatchObject({ error: "Not WCA notation: 2R" });
});

test("the result is the move count, or a DNF: not solved, over 80 moves, taken from the scramble", () => {
  // The scramble undone solves it, but is the inverse scramble (E2e1).
  expect(fmcResult(SCRAMBLE, invertAlg(SCRAMBLE))).toMatchObject({ moves: 12, dnf: true, why: "Taken from the scramble" });
  const solved = fmcResult("R U", "U' R'");
  expect(solved).toEqual({ moves: 2, solution: "U' R'", dnf: false });
  expect(fmcResult("R U", "U' R' x")).toEqual({ moves: 2, solution: "U' R' x", dnf: false });
  expect(fmcResult("R U", "U R")).toMatchObject({ dnf: true, why: "Not solved" });
  expect(fmcResult("R U", "U' R' " + "R R' ".repeat(40))).toMatchObject({ dnf: true, why: "Over 80 moves" });
});

test("Multi-Blind results are ranked and written as the WCA does (9f12c)", () => {
  expect(wcaResult("333mbf", "single", mbldValue(3, 4, 52 * 60_000 + 13_400)!)).toBe("3/4 52:13");
  expect(mbldValue(2, 4, 600_000)).not.toBeNull();
  expect(mbldValue(1, 2, 60_000)).toBeNull();
  expect(mbldValue(2, 5, 60_000)).toBeNull();
  // More points first, then a shorter time.
  expect(mbldValue(4, 4, 3_000_000)!).toBeLessThan(mbldValue(3, 3, 1_000_000)!);
  expect(mbldValue(3, 3, 1_000_000)!).toBeLessThan(mbldValue(3, 3, 1_200_000)!);
  const list = ["R U", "F2 D"];
  expect(scrambleList(numberedScrambles(list))).toEqual(list);
});

test("solves of every event give their result, figures and fields", () => {
  const fm = (moves: number | null, penalty: "none" | "dnf" = "none") => ({ time_ms: 1_800_000, penalty, solve_mode: "fewest-moves", moves });
  expect(solveResult(fm(28))).toBe(28);
  expect(solveResult(fm(28, "dnf"))).toBeNull();
  expect(fmtSolveOf(fm(28))).toBe("28");
  expect(fmtSolveOf({ time_ms: 1_000_000, penalty: "none", solve_mode: "multi-blind", cubes_solved: 3, cubes_attempted: 4 })).toBe("3/4 16:40");
  expect(fmtSolveOf({ time_ms: 12_345, penalty: "+2" })).toBe("14.345+");
  const solves = [fm(30), fm(27), fm(29)];
  expect(sessionFigures(solves, shownFigures("fewest-moves", ["ao5"]))).toEqual([
    ["Best", "27", "good"], ["Mo3", "28.67", "accent"], ["Best Mo3", "28.67", "good"], ["Mean", "28.67", ""], ["Solves", "3", ""],
  ]);
  expect(resultFields("fewest-moves", { moves: 28, cubesSolved: 2 })).toEqual({ moves: 28 });
  expect(resultFields("multi-blind", { cubesSolved: 5, cubesAttempted: 4 })).toEqual({});
  expect(resultFields("standard", { moves: 28 })).toEqual({});
});
