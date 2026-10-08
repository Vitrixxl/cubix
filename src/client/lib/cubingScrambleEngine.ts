import type { ScrambleEngine } from "./practiceScrambleCore";

/** Swap two pieces when a permutation is odd, so a single orbit stays solvable on its own. */
function evenPermutation(pieces: number[]) {
  let inversions = 0;
  pieces.forEach((a, i) => pieces.slice(i + 1).forEach(b => { if (a > b) inversions++; }));
  if (inversions % 2) [pieces[0], pieces[1]] = [pieces[1], pieces[0]];
}

/** Scrambles from cubing.js loaded as separate modules (`scramble`, `search`, `kpuzzle`): keeping its worker
 * module graph intact lets competition scramblers start their own workers. */
export function cubingScrambleEngine(load: (module: "scramble" | "search" | "kpuzzle") => Promise<any>): ScrambleEngine {
  let kpuzzle: any;
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
    async patternScramble(data) {
      const [{ random333Pattern, experimentalSolve3x3x3IgnoringCenters }, { KPattern }] = await Promise.all([load("search"), load("kpuzzle")]);
      kpuzzle ??= (await random333Pattern()).kpuzzle;
      return (await experimentalSolve3x3x3IgnoringCenters(new KPattern(kpuzzle, data))).invert().toString().replace(/2'/g, "2");
    },
  };
}
