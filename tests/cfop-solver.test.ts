import { describe, expect, test } from "bun:test";
import { applyAlg, solved } from "../src/shared/cube";
import { solveCfop } from "../src/client/lib/cfopSolver";
import { analyseSolve, colours, allDone, faceMap, playable, type CatalogCase } from "../src/client/lib/solveAnalysis";
import { canonicalTurn } from "../src/client/lib/smartCube";
import catalog from "../desktop/assets/catalog.json";

const cases = (catalog as { cases: CatalogCase[] }).cases;
/** Random face turns, from a fixed seed. */
function scramble(seed: number) {
  let x = seed;
  const random = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const turns: string[] = [];
  while (turns.length < 25) {
    const face = "UDFBRL"[Math.floor(random() * 6)]!;
    if (turns.at(-1)?.[0] === face) continue;
    turns.push(face + ["", "'", "2"][Math.floor(random() * 3)]);
  }
  return turns.join(" ");
}

describe("CFOP solutions for the virtual cube", () => {
  test("solve random scrambles with face turns and whole-cube rotations", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const start = applyAlg(solved(3), scramble(seed));
      const steps = solveCfop(start, cases);
      expect(steps, `seed ${seed}`).not.toBeNull();
      const all = steps!.map((s) => s.alg).join(" ");
      expect(all).toMatch(/^[UDFBRLxyz](2|')?( [UDFBRLxyz](2|')?)*$/);
      expect(allDone(colours(applyAlg(start, all)))).toBe(true);
    }
  });

  test("2-look: the last layer in four algorithms, recognised as two looks each", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const start = applyAlg(solved(3), scramble(seed));
      const steps = solveCfop(start, cases, { twoLook: true });
      expect(steps, `seed ${seed}`).not.toBeNull();
      expect(allDone(colours(applyAlg(start, steps!.map((s) => s.alg).join(" "))))).toBe(true);
    }
  });

  test("wide and slice turns become face turns and a rotation", () => {
    for (const alg of ["r U r'", "M2 U M' U2 M U M2", "f R U R' U' f'", "Rw U Rw'", "l' U2 L", "S R2 S'", "u R E' d2 b"]) {
      expect(Array.from(applyAlg(solved(3), playable(alg)!))).toEqual(Array.from(applyAlg(solved(3), alg)));
    }
    expect(playable("R U [R', F]")).toBeNull();
  });

  test("a solve played on a smart cube is analysed into its steps", () => {
    const start = applyAlg(solved(3), scramble(7));
    const steps = solveCfop(start, cases)!;
    // The cube reports the faces by their centres: a turn after a rotation is the face now at that place.
    const frame: string[] = [], moves: { move: string; at: number }[] = [];
    let at = 0;
    for (const step of steps) {
      at += 600;
      for (const token of step.alg.split(" ")) {
        if (/^[xyz]/.test(token)) {
          frame.push(token);
          continue;
        }
        const seen = faceMap(frame),
          face = (Object.keys(seen) as (keyof typeof seen)[]).find((held) => seen[held] === token[0])!;
        moves.push({ move: canonicalTurn(face + token.slice(1)), at: (at += 110) });
      }
    }
    const analysis = analyseSolve({ start, moves, orientations: [] }, cases)!;
    expect(analysis.cross).toBe("D");
    // Every step is the catalogue's own: no ZBLS where a plain insertion of the catalogue was played.
    expect(analysis.phases.map((p) => p.label)).not.toContain("ZBLS");
    expect(analysis.phases.map((p) => p.id)).toEqual(["cross", "f2l1", "f2l2", "f2l3", "f2l4", "oll", "pll"]);
    for (const phase of analysis.phases.filter((p) => !p.skip && p.id !== "cross")) expect(phase.case, phase.label).toBeDefined();
  });
});
