import { applyAlg, solved, type CubeState } from "../../../src/shared/cube";
import type { CaseDto, Stage } from "../../../src/shared/types";
import type { CubeMask } from "../../../src/shared/cubeAppearance";

const cache = new Map<string, CubeState>();

/** Cube state showing the case (solved cube + setup). Memoised per case. */
export function caseState(c: CaseDto): CubeState {
  let s = cache.get(c.id);
  if (!s) { s = applyAlg(solved(c.cube_size ?? 3), c.setup); cache.set(c.id, s); }
  return s;
}
export const maskForStage = (stage: Stage): CubeMask => (stage === "OLL" ? "OLL" : stage === "PLL" ? "PLL" : stage === "F2L" ? "F2L" : "full");
/** Algorithm as the user should execute it from the shown case (pre-AUF included). */
export const displayAlg = (a: { alg: string; pre_auf?: string }): string => (a.pre_auf ? `(${a.pre_auf}) ${a.alg}` : a.alg);
export const executableAlg = (a: { alg: string; pre_auf?: string }): string => (a.pre_auf ? `${a.pre_auf} ${a.alg}` : a.alg);
/** "F2L 12" → "12", "PLL T" → "T", "2L-OLL Sune" → "Sune" */
export const shortId = (c: CaseDto) => c.id.replace(/^\S+\s+/, "");
