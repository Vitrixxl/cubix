import { applyAlg, solved, type CubeState } from "../../shared/cube";
import type { CaseDto, Stage } from "../../shared/types";
import type { CubeMask } from "../components/Cube3D";

const cache = new Map<string, CubeState>();

/** Cube state showing the case (solved cube + setup). Memoised per case. */
export function caseState(c: CaseDto): CubeState {
  let s = cache.get(c.id);
  if (!s) {
    s = applyAlg(solved(), c.setup);
    cache.set(c.id, s);
  }
  return s;
}

export const maskForStage = (stage: Stage): CubeMask => (stage === "OLL" ? "OLL" : stage === "PLL" ? "PLL" : "F2L");

/** Algorithm as the user should execute it from the shown case (pre-AUF included). */
export const displayAlg = (a: { alg: string; pre_auf?: string }): string => (a.pre_auf ? `(${a.pre_auf}) ${a.alg}` : a.alg);
export const executableAlg = (a: { alg: string; pre_auf?: string }): string => (a.pre_auf ? `${a.pre_auf} ${a.alg}` : a.alg);
