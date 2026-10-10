/**
 * The solve the landing page's cube plays: the current 3×3 single world record, Xuanyi Geng's 2.51 (round 2, attempt 1,
 * Guangzhou Grand Open 2026, 5 October 2026), on its official scramble and as the community reconstructed it.
 * - Record and scramble (round 2, group A, scramble 1): the WCA, competitions/GuangzhouGrandOpen2026/results and
 *   api/v0/competitions/GuangzhouGrandOpen2026/scrambles.
 * - Reconstruction: Ruwix, blog/rubiks-cube-world-record-2_51-xuanyi-geng (desktop/tests/landing.test.ts checks it solves
 *   the scramble).
 * The cube is held as the WCA scrambles it: white on top, green in front.
 */
import { applyMove, faceOfSlot, parseAlg, solved, type CubeState, type Face } from "../../../src/shared/cube";
import { FACE_HEX } from "../../../src/shared/cubeAppearance";
import type { CubeScene } from "../../../src/shared/cubeScene";
import type { PhaseId } from "../../../src/client/lib/solveAnalysis";

export const RECORD = {
  holder: "Xuanyi Geng",
  ms: 2510,
  competition: "Guangzhou Grand Open 2026",
  results: "https://www.worldcubeassociation.org/competitions/GuangzhouGrandOpen2026/results/all?event=333",
  reconstruction: "https://ruwix.com/blog/rubiks-cube-world-record-2_51-xuanyi-geng/",
};
export const SCRAMBLE = "B2 U2 F2 D L2 D B D2 R2 B2 U D B2 U F D' F2 R";
/** The cube turned in inspection, before the timer starts. */
export const INSPECTION = "x' z'";
/** The turn that brings the solved cube back as the WCA holds it: the inspection's, and the r' of the XXCross. */
export const TURN_BACK = "y z2";
export const SOLUTION: { id: PhaseId; label: string; alg: string }[] = [
  { id: "cross", label: "XXCross", alg: "U' r' R2 U' R2' D' R2 U R' U' D'" },
  { id: "f2l3", label: "F2L · third pair", alg: "R' U' R" },
  { id: "f2l4", label: "ZBLS", alg: "L' U' L" },
  { id: "pll", label: "ZBLL", alg: "R' U R U R' U2 R U R D R' U2 R D' R'" },
];
/** Each step's moves as written, one per turn of the scene. */
export const STEP_TURNS = SOLUTION.map((step) => step.alg.split(" "));
export const TURNS = STEP_TURNS.flat().length;

/** White on top, green in front, red on the right. */
const WCA_HEX: Record<Face, number> = { U: FACE_HEX.D, D: FACE_HEX.U, F: FACE_HEX.B, B: FACE_HEX.F, R: FACE_HEX.R, L: FACE_HEX.L };
const colors = Array.from({ length: 54 }, (_, origin) => WCA_HEX[faceOfSlot(origin)]);

/** The cube played from `start` through `alg`, every state kept for `cubeShapes` to draw anywhere along it. */
function play(start: number[], alg: string): CubeScene {
  let state: CubeState = Uint16Array.from(start);
  const moves = parseAlg(alg),
    states = [start];
  for (const move of moves) states.push(Array.from((state = applyMove(state, move))));
  return { size: 3, colors, states, moves };
}
const scrambled = play(Array.from(solved(3)), SCRAMBLE).states.at(-1)!;
/** The scrambled cube, its inspection turn and the solution. */
export const solveScene = () => play(scrambled, `${INSPECTION} ${SOLUTION.map((step) => step.alg).join(" ")}`);
/**
 * The loop the hero plays: from where the solve leaves it, the cube turned back as the WCA holds it, scrambled, inspected
 * and solved, ending where it began.
 */
export function loopScene() {
  const end = solveScene().states.at(-1)!;
  return play(end, `${TURN_BACK} ${SCRAMBLE} ${INSPECTION} ${SOLUTION.map((step) => step.alg).join(" ")}`);
}
