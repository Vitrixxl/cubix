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

export const maskForStage = (stage: Stage): CubeMask => (stage === "OLL" || stage === "Last slot" ? "OLL" : stage === "PLL" || stage === "ZBLL" || stage === "OLLCP" || stage === "COLL" ? "PLL" : stage === "CMLL" ? "CMLL" : stage === "F2L" ? "F2L" : "full");
/** Stages whose case is read on stickers the eye cannot see too: their cube draws them (`cubeShapes` hints). */
export const hintsForStage = (stage: Stage) => ["F2L", "OLL", "PLL", "ZBLL", "OLLCP", "COLL", "CMLL", "CLL", "EG", "PBL", "Last slot", "TCLL", "ELL", "TTLL"].includes(stage);

/** Algorithm as the user should execute it from the shown case (pre-AUF included). */
export const displayAlg = (a: { alg: string; pre_auf?: string }): string => (a.pre_auf ? `(${a.pre_auf}) ${a.alg}` : a.alg);
export const executableAlg = (a: { alg: string; pre_auf?: string }): string => (a.pre_auf ? `${a.pre_auf} ${a.alg}` : a.alg);

/** An algorithm's length in the slice turn metric: every turn counts one, rotations (x, y, z) none. The catalogue's own `stm`. */
export const moveCount = (alg: string): number => alg.replace(/[()[\]]/g, " ").split(/\s+/).filter((m) => m && !/^[xyz]/.test(m)).length;

/** Ids built from the set rather than a usual name ("5x5 EDGES Edge flip", "Square-1 SHAPE 3"): the name says more. */
const builtId = (c: Pick<CaseDto, "id" | "name">) => c.id !== c.name && (c.id.endsWith(" " + c.name) || /^(Square-1|Pyraminx|Skewb|Megaminx) [A-Z0-9-]+ \d+$/.test(c.id));
/** A case's title: its usual id ("OLL 21", "PLL T"), or its name where the id is built from the set. */
export const caseTitle = (c: Pick<CaseDto, "id" | "name">) => builtId(c) ? c.name : c.id;
/** "F2L 12" → "12", "PLL T" → "T"; a built id gives the name. */
export const shortId = (c: Pick<CaseDto, "id" | "name">) => builtId(c) ? c.name : c.id.replace(/^\S+\s+/, "");

/** A case's algorithms in the 3D player: on its cube, its stage's stickers greyed, or on its other puzzle; null where there is no 3D model. */
export function casePlayItem(c: CaseDto): { key: string; name: string; detail?: string; context: string; algs: string[]; note?: string; size: number; mask: CubeMask; hints: boolean; puzzle?: PolyPuzzle } | null {
  const id = puzzleOf(c),
    puzzle = isPolyPuzzle(id) ? id : undefined,
    size = c.cube_size ?? puzzleInfo(id)?.cubeSize ?? 0;
  if (!puzzle && !size) return null;
  return { key: c.id, name: c.id, detail: c.name !== c.id ? c.name : undefined, context: caseContext(c), algs: c.algorithms.map(displayAlg), note: c.notes, size, mask: maskForStage(c.stage), hints: hintsForStage(c.stage), puzzle };
}
