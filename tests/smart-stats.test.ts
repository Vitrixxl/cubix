import { describe, expect, test } from "bun:test";
import { applyAlg, invertAlg, solved } from "../src/shared/cube";
import { canonicalTurn } from "../src/client/lib/smartCube";
import { analyseSolve, faceMap, playable, type CatalogCase, type RecordedSolve } from "../src/client/lib/solveAnalysis";
import { caseTimes, digest, smartAnalysis } from "../src/client/lib/smartStats";
import catalog from "../desktop/assets/catalog.json";

const cases = (catalog as { cases: CatalogCase[] }).cases;
const F2L = ["F R D2 L'", "U R U' R'", "U' L' U L", "U L U' L'", "U' R' U R"];
const OLL = "R U R' U R U2 R'";
const PLL = "R U R' U' R' F R2 U' R' U' R U R' F'";

/** A solve turned step by step, as a cube reports it, 100 ms a turn and `pause` ms before each step. */
function record(steps: string[], pause = 500): RecordedSolve {
  const moves: RecordedSolve["moves"] = [], frame: string[] = [];
  let at = 1000;
  steps.forEach((step, k) => {
    if (k) at += pause;
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
  return { start: applyAlg(solved(3), invertAlg(steps.join(" "))), moves, orientations: [] };
}
const solve = (id: number, steps: string[], pause?: number) =>
  digest(analyseSolve(record(steps, pause), cases)!, { id, created_at: `2026-10-0${id}T10:00:00.000Z`, time: 9000 + id });

describe("smart cube statistics", () => {
  test("a solve's digest: its method, its steps and its cases", () => {
    const d = solve(1, [...F2L, OLL, PLL]);
    expect(d.method).toBe("cfop");
    expect(d.steps.cross).toMatchObject({ turns: 4, recognition: 0, skip: false });
    expect(d.steps.f2l!.turns).toBe(16);
    expect(d.steps.pll).toMatchObject({ turns: 14, recognition: 600 });
    expect(d.cases.map((c) => c.step)).toEqual(["f2l", "f2l", "f2l", "f2l", "oll", "pll"]);
    expect(d.cases.at(-1)).toMatchObject({ name: "T Perm", duration: 600 + 1300, turns: 14 });
  });

  test("a last layer in two looks counts each look's case", () => {
    const twoLook = solve(3, [...F2L, "F R U R' U' F'", "R U R' U R U2 R'", PLL]);
    expect(twoLook.method).toBe("cfop-2look");
    expect(twoLook.cases.filter((c) => c.step === "oll").length).toBe(2);
  });

  test("gathers the solves by method, with the steps' means and the slowest cases to train", () => {
    const digests = [solve(1, [...F2L, OLL, PLL]), solve(2, [...F2L, OLL, PLL], 1500), solve(3, [...F2L, "F R U R' U' F'", "R U R' U R U2 R'", PLL])];
    const result = smartAnalysis(digests);
    expect(result.count).toBe(3);
    // Every method the analysis reads, the used ones first; one never used is there, empty.
    expect(result.methods.map((m) => [m.id, m.count])).toEqual([["all", 3], ["cfop", 2], ["cfop-2look", 1], ["zb", 0], ["zz", 0], ["roux", 0]]);
    expect(result.methods[0]!.xcross).toBe(0);
    const all = result.methods[0]!;
    expect(all.steps.map((s) => s.id)).toEqual(["cross", "f2l", "oll", "pll"]);
    expect(all.steps.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 5);
    const tPerm = all.cases.find((c) => c.name === "T Perm")!;
    expect(tPerm.count).toBe(3);
    expect(tPerm.recognition).toBeCloseTo((600 + 1600 + 600) / 3, 5);
    expect(result.suggestions.length).toBeGreaterThan(0);
    for (const s of result.suggestions) expect(s.action).toMatch(/^(trainCases:|trainingStart:)/);
    expect(result.latest.map((l) => l.id)).toEqual([3, 2, 1]);
    expect(smartAnalysis([])).toMatchObject({ count: 0, methods: [], suggestions: [] });
  });

  test("the cases of the solves are attempts of those cases", () => {
    const times = caseTimes([solve(2, [...F2L, OLL, PLL], 1500), solve(1, [...F2L, OLL, PLL])]);
    // Oldest first, each with its own time.
    expect(times.get("PLL T")).toEqual([
      { solveId: 1, at: "2026-10-01T10:00:00.000Z", time: 1900 },
      { solveId: 2, at: "2026-10-02T10:00:00.000Z", time: 2900 },
    ]);
  });

  test("ZZ and Roux solves are gathered under their own steps", () => {
    const zz = solve(4, ["F R D2 L' B", "L2 U L U' L'", "R2 U R' U' R", OLL, PLL]),
      roux = solve(5, ["F R D2 L' B U", "R U r' U2 M R'", OLL, "M U M'", "U M2 U'", "M' U2 M2 U2 M'"]);
    expect(zz.method).toBe("zz");
    expect(Object.keys(zz.steps)).toEqual(["eoline", "f2l", "oll", "pll"]);
    expect(zz.cases.map((c) => c.step)).toEqual(["oll", "pll"]);
    expect(roux.method).toBe("roux");
    expect(Object.keys(roux.steps)).toEqual(["fb", "sb", "cmll", "lse"]);
    const result = smartAnalysis([solve(1, [...F2L, OLL, PLL]), zz, roux]);
    expect(result.methods.find((m) => m.id === "roux")!.steps.map((s) => s.id)).toEqual(["fb", "sb", "cmll", "lse"]);
    // Every solve together: the steps of the three methods, in the order of a solve.
    const all = result.methods[0]!;
    expect(all.steps.map((s) => s.id)).toEqual(["cross", "eoline", "fb", "sb", "f2l", "cmll", "oll", "pll", "lse"]);
    expect(all.steps.find((s) => s.id === "f2l")!.count).toBe(2);
    expect(all.steps.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1, 5);
  });
});
