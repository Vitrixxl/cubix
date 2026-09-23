import { SCRAMBLE_LENGTHS } from "../../shared/scramble";
import { applyAlg, invertAlg, randomAuf, solved, type CubeState } from "../../shared/cube";
import { puzzleInfo, validContext, type PracticeContext } from "../../shared/puzzles";
import { cases } from "../local/catalog";

/** Random-state generation needs cubing.js; each platform supplies its own runtime for it. */
export interface ScrambleEngine {
  randomScrambleForEvent(event: string): Promise<string>;
  /** Random-state scramble touching only one orbit of the 3×3 (the other orbit and centres stay solved). */
  orbitScramble(orbit: "EDGES" | "CORNERS"): Promise<string>;
}
const sample = <T>(values: readonly T[]) => values[Math.floor(Math.random() * values.length)];
function moves(faces: string[], suffixes = ["", "'", "2"], length = 25) {
  let previous = "";
  return Array.from({ length }, () => { const face = sample(faces.filter(f => f !== previous)); previous = face; return face + sample(suffixes); }).join(" ");
}
const centersKey = (state: CubeState) => [4,13,22,31,40,49].map(i => state[i]).join(",");
const orientations = new Map<string, string>();
const queue = [{state:solved(), alg:""}];
for (let i = 0; i < queue.length; i++) {
  const {state,alg} = queue[i], key = centersKey(state);
  if (orientations.has(key)) continue;
  orientations.set(key,invertAlg(alg));
  for (const rotation of ["x","y","z"]) queue.push({state:applyAlg(state,rotation),alg:`${alg} ${rotation}`.trim()});
}
const setups = new Map<string, string[]>();
function caseSetup(stage: string) {
  if (!setups.has(stage)) setups.set(stage,cases.filter(c => (c.cube_size ?? 3) === 3 && c.set === stage).map(c => {
    // Catalogue setups may end with a whole-cube rotation. Keep the training blocks
    // in the standard orientation when composing playground scrambles.
    const correction = orientations.get(centersKey(applyAlg(solved(),c.setup)));
    if (correction === undefined) throw new Error("Invalid case orientation.");
    return `${c.setup} ${correction}`.trim();
  }));
  return sample(setups.get(stage)!);
}
/** Swap two pieces when a permutation is odd, so a single orbit stays solvable on its own. */
export function evenPermutation(pieces: number[]) {
  let inversions = 0;
  pieces.forEach((a, i) => pieces.slice(i + 1).forEach(b => { if (a > b) inversions++; }));
  if (inversions % 2) [pieces[0], pieces[1]] = [pieces[1], pieces[0]];
}
export const competitionEvent = ({ puzzle, solveMode }: PracticeContext) =>
  solveMode === "blindfolded" && ["333", "444", "555"].includes(puzzle) ? `${puzzle}bf` : solveMode === "one-handed" && puzzle === "333" ? "333oh" : puzzle;
export async function generatePracticeScramble(context: PracticeContext, engine: ScrambleEngine): Promise<string> {
  if (!validContext(context)) throw new Error("Unsupported puzzle or scramble type.");
  const { puzzle, scrambleType: type } = context;
  const size = puzzleInfo(puzzle).cubeSize;
  if (type === "normal") return engine.randomScrambleForEvent(competitionEvent(context));
  if (type.startsWith("2gen-") || type.startsWith("3gen-")) return moves(type.split("-")[1].toUpperCase().split(""), undefined, size === 2 ? 15 : 25);
  if (type === "half-turns") return moves(["R", "L", "U", "D", "F", "B"], ["2"], size === 2 ? 15 : 30);
  if (type === "outer-turns" && size) return moves(["R", "L", "U", "D", "F", "B"], undefined, SCRAMBLE_LENGTHS[size]);
  if (type === "edges-only" || type === "corners-only") return engine.orbitScramble(type === "edges-only" ? "EDGES" : "CORNERS");
  if (type === "last-layer") return `${caseSetup("oll")} ${caseSetup("pll")} ${randomAuf()}`.trim();
  if (["oll", "pll", "f2l"].includes(type)) return `${caseSetup(type)} ${randomAuf()}`.trim();
  throw new Error("This scramble generator is unavailable.");
}
