import type { PracticeContext } from "../../src/shared/puzzles";
import { loadKPuzzle, loadScrambler, loadSearch } from "./cubing";
import { evenPermutation, generatePracticeScramble as generate, type ScrambleEngine } from "../../src/client/lib/practiceScrambleCore";

/** The desktop runs cubing.js from the packaged module tree in Bun workers. */
export const desktopEngine: ScrambleEngine = {
  async randomScrambleForEvent(event) {
    const { randomScrambleForEvent } = await loadScrambler();
    return (await randomScrambleForEvent(event)).toString();
  },
  async orbitScramble(orbit) {
    const [{ random333Pattern, experimentalSolve3x3x3IgnoringCenters }, { KPattern }] = await Promise.all([loadSearch(), loadKPuzzle()]);
    const pattern = await random333Pattern();
    const data = structuredClone(pattern.patternData), solved = pattern.kpuzzle.defaultPattern().patternData;
    const other = orbit === "EDGES" ? "CORNERS" : "EDGES";
    data[other] = structuredClone(solved[other]);
    data.CENTERS = structuredClone(solved.CENTERS);
    evenPermutation(data[orbit].pieces);
    return (await experimentalSolve3x3x3IgnoringCenters(new KPattern(pattern.kpuzzle, data))).invert().toString();
  },
};
export const generatePracticeScramble = (context: PracticeContext, engine: ScrambleEngine = desktopEngine) => generate(context, engine);
