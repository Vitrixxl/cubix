import { describe, expect, test } from "bun:test";
import { invertAlg } from "../src/shared/cube";
import { canonicalTurn } from "../src/client/lib/smartCube";
import { faceMap, playable, type CatalogCase } from "../src/client/lib/solveAnalysis";
import { writeSolution } from "../src/client/lib/solution";
import { setupTurns } from "../src/client/lib/smartTraining";
import { createSmartDigests } from "../desktop/engine/smartDigests";
import type { CaseStatsDto, SolveDto } from "../src/shared/types";
import catalog from "../desktop/assets/catalog.json";

const cases = (catalog as { cases: CatalogCase[] }).cases;
const STEPS = ["F R D2 L'", "U R U' R'", "U' L' U L", "U L U' L'", "U' R' U R", "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'"];

/** A timer solve turned on a smart cube: its scramble, and its turns 100 ms apart as its solution. */
function smartSolve(id: number, extra: Partial<SolveDto> = {}): SolveDto {
  const moves: { move: string; at: number }[] = [], frame: string[] = [];
  let at = 0;
  for (const token of playable(STEPS.join(" "))!.split(" ")) {
    if (/^[xyz]/.test(token)) { frame.push(token); continue; }
    const seen = faceMap(frame), face = (Object.keys(seen) as (keyof typeof seen)[]).find((held) => seen[held] === token[0])!;
    moves.push({ move: canonicalTurn(face + token.slice(1)), at: (at += 100) });
  }
  return { id, session_id: 1, case_id: null, time_ms: 9000, penalty: "none", scramble: setupTurns(invertAlg(STEPS.join(" ")))!.canonical, solution: writeSolution(moves), created_at: `2026-10-0${id}T10:00:00.000Z`, puzzle_id: "333", solve_mode: "standard", scramble_type: "normal", ...extra };
}
const memory = () => {
  const values: Record<string, string> = {};
  return { getItem: (k: string) => values[k] ?? null, setItem: (k: string, v: string) => void (values[k] = v), removeItem: (k: string) => void delete values[k], all: () => ({ ...values }) };
};
const trainingSolve: SolveDto = { id: 50, session_id: 2, case_id: "PLL T", time_ms: 1200, penalty: "none", scramble: null, created_at: "2026-10-05T10:00:00.000Z", puzzle_id: "333", solve_mode: "standard", scramble_type: "case" };
const trainingStats: CaseStatsDto[] = [];
const emptyHistory = { summary: { caseId: "PLL T", count: 0 } as any, history: [], ao5: [], ao12: [] };

describe("smart cube digests", () => {
  test("analyses the solves once, the ones over its budget between requests, and gathers them by method", async () => {
    const digests = createSmartDigests({ storage: memory(), cases, changed: () => {} });
    const solves = [smartSolve(1), smartSolve(2), { ...smartSolve(3), solution: null }];
    let analysis = digests.analysis(digests.digests(solves, "standard"), "standard");
    expect(analysis.count + analysis.pending).toBe(2);
    while (analysis.pending) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      analysis = digests.analysis(digests.digests(solves, "standard"), "standard");
    }
    expect(analysis.count).toBe(2);
    expect(analysis.methods[0]!.cases.find((c) => c.id === "PLL T")?.count).toBe(2);
    // A deleted solve leaves the analysis; a penalty follows the solve.
    expect(digests.analysis(digests.digests([{ ...solves[0]!, penalty: "dnf" }], "standard"), "standard")).toMatchObject({ count: 1, latest: [{ id: 1, time: null }] });
  });

  test("a case's times come from its training, the solves it was done in, or both", async () => {
    const digests = createSmartDigests({ storage: memory(), cases, changed: () => {} });
    const timer = [smartSolve(1), smartSolve(2)];
    while (digests.analysis(digests.digests(timer, "standard"), "standard").pending) await new Promise((resolve) => setTimeout(resolve, 50));
    const inSolves = digests.caseHistory("PLL T", "solves", digests.digests(timer, "standard"), [trainingSolve], emptyHistory, "standard");
    expect(inSolves.history.map((h) => h.solveId)).toEqual([1, 2]);
    expect(inSolves.history.every((h) => h.smart && h.id < 0)).toBe(true);
    const all = digests.caseHistory("PLL T", "all", digests.digests(timer, "standard"), [trainingSolve], emptyHistory, "standard");
    expect(all.summary.count).toBe(3);
    expect(all.summary.best).toBe(1200);
    const stats = digests.caseStats("all", digests.digests(timer, "standard"), [trainingSolve], trainingStats, "standard");
    expect(stats.find((c) => c.caseId === "PLL T")?.count).toBe(3);
  });

  test("keeps the digests on the device", async () => {
    const storage = memory();
    (() => { const d = createSmartDigests({ storage, cases, changed: () => {} }); d.analysis(d.digests([smartSolve(1)], "standard"), "standard"); })();
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect(Object.keys(JSON.parse(storage.getItem("cubix.smart.digests.v1")!))).toEqual(["1"]);
    // Another engine reads them back without analysing again: a solution it could not read is still known.
    expect((() => { const d = createSmartDigests({ storage, cases, changed: () => {} }); return d.analysis(d.digests([smartSolve(1)], "standard"), "standard").count; })()).toBe(1);
  });
});
