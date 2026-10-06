import { describe, expect, test } from "bun:test";
import { applyAlg, invertAlg, solved } from "../src/shared/cube";
import { algScene } from "../src/client/lib/algPlayer";
import { canonicalTurn, isSolved } from "../src/client/lib/smartCube";
import { analyseSolve, type CatalogCase } from "../src/client/lib/solveAnalysis";
import { heldAlg, readSolution, recordedSolve, SOLUTION_MAX, writeSolution } from "../src/client/lib/solution";
import catalog from "../desktop/assets/catalog.json";

const cases = (catalog as { cases: CatalogCase[] }).cases;
/** A CFOP solve of face turns, held yellow on top and green in front, and the scramble it solves, as written. */
const HELD = "F R D2 L' U R U' R' U' L' U L U L U' L' U' R' U R R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F'".split(" "),
  SCRAMBLE = invertAlg(HELD.join(" ")).split(/\s+/).map(canonicalTurn).join(" "),
  /** The cube reports the turns white on top, 100 ms apart from any clock. */
  moves = HELD.map((turn, i) => ({ move: canonicalTurn(turn), at: 5000 + i * 100 }));

describe("solve solution", () => {
  test("is written with each turn's time since the first, and read back", () => {
    const solution = writeSolution(moves)!;
    expect(solution.startsWith("F@0 L@100 U2@200 R'@300 ")).toBe(true);
    expect(readSolution(solution)).toEqual(moves.map(({ move, at }) => ({ move, at: at - 5000 })));
    expect(readSolution("R U2'  F'")).toEqual([{ move: "R" }, { move: "U2'" }, { move: "F'" }]);
    expect(writeSolution([])).toBeNull();
    expect(writeSolution(Array.from({ length: SOLUTION_MAX / 4 }, (_, at) => ({ move: "R", at })))).toBeNull();
    for (const unreadable of [null, undefined, "", "  ", "R x U", "Rw", "R@", "R@1.5", "R@-3"]) expect(readSolution(unreadable)).toBeNull();
  });

  test("names its turns as the held cube turns them", () => {
    expect(heldAlg(["R", "U'", "F2", "D", "L2'", "B"])).toBe("L D' F2 U R2' B");
    expect(heldAlg(["R", "x"])).toBeNull();
  });

  test("plays in 3D from the scramble to the solved cube", () => {
    const turns = readSolution(writeSolution(moves))!,
      scene = algScene(heldAlg(turns.map((turn) => turn.move))!, 3, "full", heldAlg(SCRAMBLE.split(" "))!)!;
    expect(scene.states).toHaveLength(HELD.length + 1);
    expect(scene.states[0]).toEqual(Array.from(applyAlg(solved(3), invertAlg(HELD.join(" ")))));
    expect(isSolved(Uint16Array.from(scene.states.at(-1)!))).toBe(true);
  });

  test("gives the solve back for its analysis", () => {
    const turns = readSolution(writeSolution(moves))!,
      analysis = analyseSolve(recordedSolve(SCRAMBLE, turns)!, cases)!;
    expect(analysis.time).toBe((HELD.length - 1) * 100);
    expect(analysis.cross).toBe("D");
    expect(analysis.phases.map((p) => p.label)).toEqual(["Cross", "F2L 1", "F2L 2", "F2L 3", "F2L 4", "OLL", "PLL"]);
    // Not without the times, nor without a scramble of face turns to start from.
    expect(recordedSolve(SCRAMBLE, readSolution("R U R'")!)).toBeNull();
    expect(recordedSolve(null, turns)).toBeNull();
    expect(recordedSolve("Rw U", turns)).toBeNull();
  });
});
