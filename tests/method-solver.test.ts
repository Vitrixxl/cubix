import { describe, expect, test } from "bun:test";
import { applyAlg, solved, type CubeState, type Face } from "../src/shared/cube";
import { solveMethod } from "../src/client/lib/methodSolver";
import { scannedState } from "../src/client/lib/cubeScan";
import { allDone, BLOCK, colours, crossDone, edgesOriented, edgesOrientedFB, eoLine, f2lDone, matches, solvedAt, TOP_CORNERS, topDone, turnWhole, type CatalogCase } from "../src/client/lib/solveAnalysis";
import catalog from "../desktop/assets/catalog.json";

const cases = (catalog as { cases: CatalogCase[] }).cases;
/** Random face turns, from a fixed seed. */
function scramble(seed: number) {
  let x = seed;
  const random = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const turns: string[] = [];
  while (turns.length < 25) {
    const face = "UDFBRL"[Math.floor(random() * 6)]!;
    if (turns.at(-1)?.[0] === face) continue;
    turns.push(face + ["", "'", "2"][Math.floor(random() * 3)]);
  }
  return turns.join(" ");
}

/** Roux's blocks are read whatever M turn the centres are at, the cube held either way about x. */
const roux = (pieces: number[][]) => (_: Face[], state: CubeState) =>
  ["", "x", "x2", "x'"].some((x) => [0, 1, 2, 3].some((k) => matches(colours(turnWhole(state, x ? [x] : [])), k, pieces)));
/** What each step of each course has done once its last part is played. */
const DONE: Record<string, ((c: Face[], state: CubeState) => boolean)[]> = {
  beginner: [
    crossDone,
    (c) => crossDone(c) && [[1, -1, 1], [-1, -1, 1], [1, -1, -1], [-1, -1, -1]].every((p) => solvedAt(c, p)),
    f2lDone,
    (c) => f2lDone(c) && edgesOriented(c),
    (c) => f2lDone(c) && topDone(c),
    allDone,
  ],
  cfop: [crossDone, f2lDone, (c) => f2lDone(c) && topDone(c), allDone],
  zz: [eoLine, (c) => f2lDone(c) && edgesOrientedFB(c), allDone],
  roux: [roux(BLOCK(-1)), roux([...BLOCK(-1), ...BLOCK(1)]), roux([...BLOCK(-1), ...BLOCK(1), ...TOP_CORNERS]), allDone],
};

describe("assisted solve plans for every 3×3 course", () => {
  for (const [method, done] of Object.entries(DONE))
    test(method, () => {
      let turns = 0,
        slowest = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const scrambled = applyAlg(solved(3), scramble(seed)),
          // Half the cubes as the camera reads them: stickers numbered by colour only.
          start = seed % 2 ? scannedState(colours(scrambled)) : scrambled,
          t0 = performance.now(),
          parts = solveMethod(method, start, cases);
        slowest = Math.max(slowest, performance.now() - t0);
        expect(parts, `seed ${seed}`).not.toBeNull();
        let state = start;
        parts!.forEach((part, i) => {
          expect(part.alg, `seed ${seed} ${part.label}`).toMatch(/^[UDFBRL](2|')?( [UDFBRL](2|')?)*$/);
          if (i) expect(part.step).toBeGreaterThanOrEqual(parts![i - 1]!.step);
          state = applyAlg(state, part.alg);
          turns += part.alg.split(" ").length;
          // The last part of a step: that step and those before it are done.
          if (parts![i + 1]?.step !== part.step) for (let k = 0; k <= part.step; k++) expect(done[k]!(colours(state), state), `seed ${seed} step ${k} after ${part.label}`).toBe(true);
        });
        expect(allDone(colours(state))).toBe(true);
      }
      console.log(`${method}: ${(turns / 30).toFixed(1)} turns on average, slowest plan ${slowest.toFixed(0)} ms`);
    });

  test("a cube no turns can solve has no plan", () => {
    // The top front right corner twisted in place: its stickers on U, F and R.
    const twisted = colours(applyAlg(solved(3), scramble(3)));
    [twisted[8], twisted[20], twisted[36]] = [twisted[20]!, twisted[36]!, twisted[8]!];
    for (const method of Object.keys(DONE)) expect(solveMethod(method, scannedState(twisted), cases)).toBeNull();
  });
});
