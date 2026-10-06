/**
 * The solution of a solve: the turns that were made, kept with the solve as text. Turns are written as a smart cube
 * reports them and as scrambles are written (white on top, green in front), so the scramble then the solution is the
 * whole attempt. A turn may carry its time, in milliseconds since the first one: `R@0 U'@142 F2@310`.
 */
import { applyMove, parseScramble, solved } from "../../shared/cube";
import { trackable } from "./scrambleTracker";
import { canonicalTurn } from "./smartCube";
import type { RecordedSolve } from "./solveAnalysis";

/** The longest solution kept, in characters: well over a thousand timed turns. */
export const SOLUTION_MAX = 10000;

export interface SolutionTurn {
  move: string;
  /** Milliseconds since the first turn, when the solution is timed. */
  at?: number;
}

const TURN = /^([UDFBRL](?:2|'|2')?)(?:@(\d+))?$/;

/** The solution made of these turns (`at` on any clock, in milliseconds); null when there is none to keep. */
export function writeSolution(moves: readonly { move: string; at: number }[]): string | null {
  const start = moves[0]?.at ?? 0,
    text = moves.map(({ move, at }) => `${move}@${Math.max(0, Math.round(at - start))}`).join(" ");
  return text && text.length <= SOLUTION_MAX ? text : null;
}

/** The turns of a solution; null when it is not one of outer face turns. */
export function readSolution(text: string | null | undefined): SolutionTurn[] | null {
  const words = text?.trim().split(/\s+/) ?? [],
    turns: SolutionTurn[] = [];
  if (!text?.trim() || text.length > SOLUTION_MAX) return null;
  for (const word of words) {
    const match = TURN.exec(word);
    if (!match) return null;
    turns.push(match[2] === undefined ? { move: match[1]! } : { move: match[1]!, at: Number(match[2]) });
  }
  return turns;
}

/**
 * Face turns as they turn the cube Cubix shows, held yellow on top and green in front (see `parseScramble`): what the
 * 3D player takes, and how a solver holding the cube that way names them. Null when a turn is not a face turn.
 */
export function heldAlg(turns: readonly string[]): string | null {
  try {
    return turns.map(canonicalTurn).join(" ");
  } catch {
    return null;
  }
}

/** A timed solution as the solve recorded from the scramble, for its analysis; null when it cannot be one. */
export function recordedSolve(scramble: string | null | undefined, turns: readonly SolutionTurn[]): RecordedSolve | null {
  if (!scramble || !trackable(scramble) || !turns.length || turns.some((turn) => turn.at === undefined)) return null;
  return {
    start: parseScramble(scramble).reduce(applyMove, solved(3)),
    moves: turns.map(({ move, at }) => ({ move, at: at! })),
    orientations: [],
  };
}
