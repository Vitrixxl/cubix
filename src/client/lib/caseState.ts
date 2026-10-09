import { applyAlg, solved, type CubeState } from "../../shared/cube";
import type { CaseDto, Stage } from "../../shared/types";
import type { CubeMask } from "../../shared/cubeAppearance";
import { isPolyPuzzle, type PolyPuzzle } from "../../shared/puzzleScene";
import { puzzleInfo, puzzleOf } from "../../shared/puzzles";
import { caseContext } from "./practiceCatalog";

const cache = new Map<string, CubeState>();

/** Cube state showing the case (solved cube + setup). Memoised per case. */
export function caseState(c: CaseDto): CubeState {
  let s = cache.get(c.id);
  if (!s) {
    s = applyAlg(solved(c.cube_size ?? 3), c.setup);
    cache.set(c.id, s);
  }
  return s;
}

export const maskForStage = (stage: Stage): CubeMask => (stage === "OLL" ? "OLL" : stage === "PLL" || stage === "ZBLL" ? "PLL" : stage === "F2L" ? "F2L" : "full");

/** Algorithm as the user should execute it from the shown case (pre-AUF included). */
export const displayAlg = (a: { alg: string; pre_auf?: string }): string => (a.pre_auf ? `(${a.pre_auf}) ${a.alg}` : a.alg);
export const executableAlg = (a: { alg: string; pre_auf?: string }): string => (a.pre_auf ? `${a.pre_auf} ${a.alg}` : a.alg);

/** "F2L 12" → "12", "PLL T" → "T". */
export const shortId = (c: Pick<CaseDto, "id">) => c.id.replace(/^\S+\s+/, "");

/** A case's algorithms in the 3D player: on its cube, its stage's stickers greyed, or on its other puzzle; null where there is no 3D model. */
export function casePlayItem(c: CaseDto): { key: string; name: string; detail?: string; context: string; algs: string[]; note?: string; size: number; mask: CubeMask; puzzle?: PolyPuzzle } | null {
  const id = puzzleOf(c),
    puzzle = isPolyPuzzle(id) ? id : undefined,
    size = c.cube_size ?? puzzleInfo(id)?.cubeSize ?? 0;
  if (!puzzle && !size) return null;
  return { key: c.id, name: c.id, detail: c.name !== c.id ? c.name : undefined, context: caseContext(c), algs: c.algorithms.map(displayAlg), note: c.notes, size, mask: maskForStage(c.stage), puzzle };
}
