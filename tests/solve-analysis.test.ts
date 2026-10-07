import { describe, expect, test } from "bun:test";
import { applyAlg, invertAlg, solved } from "../src/shared/cube";
import { canonicalTurn, rotation } from "../src/client/lib/smartCube";
import { analyseSolve, faceMap, mergeTurns, playable, type CatalogCase, type RecordedSolve } from "../src/client/lib/solveAnalysis";
import catalog from "../desktop/assets/catalog.json";

const cases = (catalog as { cases: CatalogCase[] }).cases;
/** A CFOP solve, held yellow on top and green in front, step by step: each step leaves the steps before it solved. */
const STEPS = [
  "F R D2 L'",
  "U R U' R'",
  "U' L' U L",
  "U L U' L'",
  "U' R' U R",
  "R U R' U R U2 R'",
  "R U R' U' R' F R2 U' R' U' R U R' F'",
];

/**
 * Records the steps as a cube would: turns named white on top, by their centres (a turn after a rotation is the face
 * now at that place; wide and slice turns are face turns and a rotation), 100 ms apart, half a second before each step.
 */
function record(steps: string[], orientations: RecordedSolve["orientations"] = []): RecordedSolve {
  const moves: RecordedSolve["moves"] = [], frame: string[] = [];
  let at = 1000;
  steps.forEach((step, k) => {
    if (k) at += 500;
    for (const token of playable(step)!.split(" ")) {
      if (/^[xyz]/.test(token)) {
        frame.push(token);
        continue;
      }
      const seen = faceMap(frame),
        face = (Object.keys(seen) as (keyof typeof seen)[]).find((held) => seen[held] === token[0])!;
      moves.push({ move: canonicalTurn(face + token.slice(1)), at });
      at += 100;
    }
  });
  return { start: applyAlg(solved(3), invertAlg(steps.join(" "))), moves, orientations };
}

describe("solve analysis", () => {
  test("splits a CFOP solve into its steps, with their times", () => {
    const analysis = analyseSolve(record(STEPS), cases)!;
    expect(analysis.cross).toBe("D");
    expect(analysis.phases.map((p) => p.label)).toEqual(["Cross", "F2L 1", "F2L 2", "F2L 3", "F2L 4", "OLL", "PLL"]);
    expect(analysis.phases.map((p) => p.turns.length)).toEqual([4, 4, 4, 4, 4, 7, 14]);
    expect(analysis.turns).toBe(41);
    const [cross, pair] = analysis.phases;
    expect(cross).toMatchObject({ start: 0, recognition: 0, turns: ["F", "R", "D2", "L'"] });
    // The cross ends on its fourth turn (300 ms); the pair's first turn comes 500 ms later.
    expect(pair).toMatchObject({ start: 300, recognition: 600, execution: 300, turns: ["U", "R", "U'", "R'"] });
    expect(analysis.time).toBe(analysis.phases.at(-1)!.end);
  });

  test("recognises the cases and checks the catalogue's algorithms on the solve", () => {
    const { phases } = analyseSolve(record(STEPS), cases)!;
    expect(phases[1]!.case?.name).toBe("F2L 1");
    expect(phases[1]!.pair).toEqual(["F", "R"]);
    expect(phases[1]!.suggestions[0]).toEqual({ alg: "U R U' R'", turns: 4 });
    // The back pairs are read from the front right: the suggestion turns the cube first.
    expect(phases[4]!.suggestions[0]!.alg).toMatch(/^y/);
    expect(phases[5]!.case?.name).toBeDefined();
    expect(phases[5]!.suggestions.length).toBeGreaterThan(0);
    expect(phases[6]!.case?.name).toBe("T Perm");
    expect(phases[6]!.suggestions[0]!.turns).toBe(14);
    // The cross: an optimal solution, no longer than the one done.
    expect(phases[0]!.suggestions[0]!.turns).toBeLessThanOrEqual(4);
    expect(phases[0]!.suggestions[0]!.turns).toBeGreaterThan(0);
  });

  test("an angle and a turn of the top before the case are recognised", () => {
    const { phases } = analyseSolve(record([...STEPS.slice(0, 5), "U2 R U R' U R U2 R'", "U' R U R' U' R' F R2 U' R' U' R U R' F' U"]), cases)!;
    expect(phases[6]!.case?.name).toBe("T Perm");
    expect(phases[5]!.suggestions.length).toBeGreaterThan(0);
  });

  test("a cross made with pairs in place is an XCross, an XXCross…", () => {
    // The cross's last turn, R', puts back both right pairs too: only the left ones are left to insert.
    const { phases } = analyseSolve(record(["F R D2 L' R'", "U' L' U L", "U L U' L'", ...STEPS.slice(5)]), cases)!;
    expect(phases.map((p) => p.label).slice(0, 5)).toEqual(["XXCross", "F2L 1", "F2L 2", "F2L 3", "F2L 4"]);
    expect(phases.map((p) => p.skip).slice(0, 5)).toEqual([false, true, true, false, false]);
  });

  test("ZBLS: the last pair inserted with the top edges oriented", () => {
    const { phases } = analyseSolve(record([...STEPS.slice(0, 4), "R U2 F R2 F' U2 R'", ...STEPS.slice(5)]), cases)!;
    expect(phases.map((p) => p.label)).toEqual(["Cross", "F2L 1", "F2L 2", "F2L 3", "ZBLS", "OLL", "PLL"]);
  });

  test("ZBLL: the whole last layer in one step, its case recognised", () => {
    const zbll = cases.find((c) => c.id === "ZBLL T 1")!;
    const { phases } = analyseSolve(record([...STEPS.slice(0, 5), "U " + zbll.algorithms[0]!.alg]), cases)!;
    expect(phases.at(-2)).toMatchObject({ label: "ZBLL", case: { id: "ZBLL T 1" } });
    expect(phases.at(-2)!.suggestions.length).toBeGreaterThan(0);
    expect(phases.at(-1)!.skip).toBe(true);
  });

  test("2-look OLL: the top edges first, then the corners, each with its case", () => {
    const { phases } = analyseSolve(record([...STEPS.slice(0, 5), "F R U R' U' F'", "R U R' U R U2 R'", STEPS[6]!]), cases)!;
    const oll = phases[5]!;
    expect(oll.label).toBe("2-look OLL");
    expect(oll.looks!.map((l) => [l.label, l.case?.name, l.turns.length])).toEqual([["Edges", "I-Shape", 6], ["Corners", "Sune", 7]]);
    expect(oll.looks![1]!.recognition).toBe(600);
    // The full OLL of the step, as the one look to aim for.
    expect(oll.case).toBeDefined();
    expect(oll.suggestions.length).toBeGreaterThan(0);
  });

  test("2-look PLL: the corners first, then the edges", () => {
    const { phases } = analyseSolve(record([...STEPS.slice(0, 6), "R U R' U' R' F R2 U' R' U' R U R' F'", "R U' R U R U R U' R' U' R2"]), cases)!;
    const pll = phases[6]!;
    expect(pll.label).toBe("2-look PLL");
    expect(pll.looks!.map((l) => l.label)).toEqual(["Corners", "Edges"]);
    expect(pll.looks![0]!.case?.name).toBe("Headlights");
    expect(pll.looks![1]!.case?.name).toMatch(/U/);
    expect(pll.looks![1]!.suggestions.length).toBeGreaterThan(0);
  });

  test("a full OLL and PLL are one look each, the last turn of the top included", () => {
    const { phases } = analyseSolve(record(STEPS), cases)!;
    expect(phases.slice(5).map((p) => [p.label, p.looks])).toEqual([["OLL", undefined], ["PLL", undefined]]);
    // A PLL done from another angle ends with a turn of the top: still one look.
    const angled = analyseSolve(record([...STEPS.slice(0, 6), "U' R U R' U' R' F R2 U' R' U' R U R' F' U"]), cases)!;
    expect(angled.phases[6]!.label).toBe("PLL");
    expect(angled.phases[6]!.looks).toBeUndefined();
  });

  test("a step solved by the one before is a skip", () => {
    const { phases } = analyseSolve(record(STEPS.slice(0, 6)), cases)!;
    expect(phases.at(-1)).toMatchObject({ label: "PLL", skip: true, turns: [] });
  });

  test("a gyroscope gives the side held in front", () => {
    // Held with orange in front (a y from green): the turns are named from there, R becoming F.
    const analysis = analyseSolve(record(STEPS, [{ quaternion: rotation([0, 1, 0], -Math.PI / 2), at: 0 }]), cases)!;
    expect(analysis.phases[0]!.frame).toEqual(["y"]);
    expect(analysis.phases[1]!.turns).toEqual(["U", "F", "U'", "F'"]);
  });

  test("turns of one face in a row merge", () => {
    expect(mergeTurns(["R", "R", "U", "U'", "F'", "F'"])).toEqual(["R2", "F2"]);
  });

  test("an unfinished solve is not analysed", () => {
    expect(analyseSolve({ start: solved(3), moves: [{ move: "R", at: 0 }], orientations: [] }, cases)).toBeNull();
  });

  test("tells CFOP, ZZ and Roux apart, each in its steps", () => {
    expect(analyseSolve(record(STEPS), cases)!.method).toBe("cfop");
    // ZZ: the EOLine, then blocks of R, L and U turns only, which keep the edges oriented, then the last layer.
    const zz = analyseSolve(record(["F R D2 L' B", "L2 U L U' L'", "R2 U R' U' R", STEPS[5]!, STEPS[6]!]), cases)!;
    expect(zz.method).toBe("zz");
    expect(zz.phases.map((p) => p.id)).toEqual(["eoline", "fb", "sb", "oll", "pll"]);
    expect(zz.phases.map((p) => p.turns.length)).toEqual([5, 5, 5, 7, 14]);
    expect(zz.phases[4]!.case?.name).toBe("T Perm");
    // Roux: the first block, the second of R, r, M and U turns, CMLL, then the six edges in three parts.
    const roux = analyseSolve(record(["F R D2 L' B U", "R U r' U2 M R'", STEPS[5]!, "M U M'", "U M2 U'", "M' U2 M2 U2 M'"]), cases)!;
    expect(roux.method).toBe("roux");
    expect(roux.phases.map((p) => p.id)).toEqual(["fb", "sb", "cmll", "lse"]);
    expect(roux.phases.map((p) => p.end - p.start > 0)).toEqual([true, true, true, true]);
    expect(roux.phases[2]!.turns.length).toBe(7);
    expect(roux.phases[3]!.looks?.map((l) => l.label)).toEqual(["EO", "UL/UR", "EP"]);
    expect(roux.phases[3]!.looks?.map((l) => l.skip)).toEqual([false, false, false]);
  });
});
