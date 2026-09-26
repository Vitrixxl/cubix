import { evenPermutation, type ScrambleEngine } from "./practiceScrambleCore";

/** Scrambles from cubing.js loaded as separate modules (`scramble`, `search`, `kpuzzle`): keeping its worker
 * module graph intact lets competition scramblers start their own workers. */
export function cubingScrambleEngine(load: (module: "scramble" | "search" | "kpuzzle") => Promise<any>): ScrambleEngine {
  return {
    async randomScrambleForEvent(event) {
      const { randomScrambleForEvent } = await load("scramble");
      return (await randomScrambleForEvent(event)).toString();
    },
    async orbitScramble(orbit) {
      const [{ random333Pattern, experimentalSolve3x3x3IgnoringCenters }, { KPattern }] = await Promise.all([load("search"), load("kpuzzle")]);
      const pattern = await random333Pattern();
      const data = structuredClone(pattern.patternData), solved = pattern.kpuzzle.defaultPattern().patternData;
      const other = orbit === "EDGES" ? "CORNERS" : "EDGES";
      data[other] = structuredClone(solved[other]);
      data.CENTERS = structuredClone(solved.CENTERS);
      evenPermutation(data[orbit].pieces);
      return (await experimentalSolve3x3x3IgnoringCenters(new KPattern(pattern.kpuzzle, data))).invert().toString();
    },
  };
}
