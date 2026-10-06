/**
 * The solve the landing page's cube plays under the scroll: a scramble and the CFOP solution the app's own solver
 * finds for it (src/client/lib/cfopSolver.ts, checked by the tests), written here so the page carries neither the
 * solver nor the catalogue. The cube is held yellow on top, green in front, as the app shows a smart cube.
 */
import { applyMove, faceOfSlot, parseAlg, parseScramble, solved } from "../../../src/shared/cube";
import { HELD_HEX } from "../../../src/shared/cubeAppearance";
import type { CubeScene } from "../../../src/shared/cubeScene";
import type { PhaseId } from "../../../src/client/lib/solveAnalysis";

export const SCRAMBLE = "R U D R2 U B' R' F' B D R U2 D' L2 F L' F L2 R D2";
export const SOLUTION: { id: PhaseId; label: string; alg: string }[] = [
  { id: "cross", label: "Cross", alg: "U B R U B' L F'" },
  { id: "f2l1", label: "F2L · first pair", alg: "y U' R' U' R2 U R'" },
  { id: "f2l2", label: "F2L · second pair", alg: "y2 U' F' L' U2 L F" },
  { id: "f2l3", label: "F2L · third pair", alg: "y' U2 R U R'" },
  { id: "f2l4", label: "F2L · last pair", alg: "y2 U2 F' U' F" },
  { id: "oll", label: "OLL 45", alg: "U2 F R U R' U' F'" },
  { id: "pll", label: "PLL · Y perm", alg: "U R2 U' R2 U' R2 U F U F' R2 F U' F' U2" },
];
/** Each step's moves as written, one per turn of the scene. */
export const STEP_TURNS = SOLUTION.map((step) => step.alg.split(" "));
/** The face turns of the solution: turning the whole cube is not a turn. */
export const TURNS = STEP_TURNS.flat().filter((turn) => !/^[xyz]/.test(turn)).length;

/** The scrambled cube and every state of its solution, for `cubeShapes` to draw anywhere along it. */
export function solveScene(): CubeScene {
  let state = solved(3);
  for (const move of parseScramble(SCRAMBLE)) state = applyMove(state, move);
  const moves = SOLUTION.flatMap((step) => parseAlg(step.alg)),
    states = [Array.from(state)];
  for (const move of moves) states.push(Array.from((state = applyMove(state, move))));
  return { size: 3, colors: Array.from({ length: 54 }, (_, origin) => HELD_HEX[faceOfSlot(origin)]), states, moves };
}
