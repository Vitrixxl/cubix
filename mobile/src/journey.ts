import { atom } from "jotai";
import type { Experience, PersonalGoal } from "../../src/client/lib/journey";
import { puzzleInfo, type PuzzleId } from "../../src/shared/puzzles";
import { local } from "./api";
import { statsVersionAtom, userAtom } from "./state";

export const introductionAtom = atom<"setup" | "tour" | "goal" | null>(null);
export const editingGoalAtom = atom("");
export const journeyAtom = atom(get => { get(statsVersionAtom); get(userAtom); return local.read.journey(); });
export const goalsAtom = atom(get => { get(statsVersionAtom); get(userAtom); return local.read.goals(); });

/** A typical 3×3 single at each level, in seconds, and how much longer each puzzle usually takes than a 3×3. */
const LEVEL_SINGLE: Record<Experience, number> = { new: 120, beginner: 45, intermediate: 25, advanced: 12 };
const PUZZLE_SCALE: Record<PuzzleId, number> = { "222": .3, "333": 1, "444": 2.6, "555": 4.6, "666": 8, "777": 11, sq1: 1.3, pyram: .4, skewb: .4, minx: 4.5, clock: .6 };
/** The 3×3 sets worth learning next at each level; other puzzles start with their first set. */
const NEXT_SETS: Partial<Record<Experience, string[]>> = { beginner: ["2look-oll", "2look-pll"], intermediate: ["pll", "oll"], advanced: ["oll", "zbll-t"] };

export interface GoalSuggestion { id: string; goal: PersonalGoal }
/**
 * One-tap goals for the setup's goals step, from the level and the first puzzle being learned: learn to solve it when it
 * is new, a single and an average to beat, and the next algorithm set. `sets` are the puzzle's sets that have cases.
 */
export function suggestedGoals(level: Experience, puzzle: PuzzleId, canSolve: boolean, sets: readonly { id: string }[], now = new Date().toISOString()): GoalSuggestion[] {
  const base = { puzzle, createdAt: now };
  const result: GoalSuggestion[] = [];
  if (!canSolve) result.push({ id: `solve:${puzzle}`, goal: { ...base, kind: "learning", setId: null } });
  const single = LEVEL_SINGLE[canSolve && level === "new" ? "beginner" : level] * (PUZZLE_SCALE[puzzle] ?? 1);
  // Round to a friendly target: whole seconds under a minute, ten-second steps above.
  const round = (s: number) => Math.max(1, s < 60 ? Math.round(s) : Math.round(s / 10) * 10);
  result.push({ id: `single:${puzzle}`, goal: { ...base, kind: "time", metric: "single", solveMode: "standard", targetMs: round(single) * 1000 } });
  result.push({ id: `ao5:${puzzle}`, goal: { ...base, kind: "time", metric: "ao5", solveMode: "standard", targetMs: round(single * 1.2) * 1000 } });
  const preferred = puzzle === "333" ? NEXT_SETS[level] ?? [] : [];
  const set = preferred.map(id => sets.find(s => s.id === id)).find(Boolean) ?? (level !== "new" ? sets[0] : undefined);
  if (set) result.push({ id: `set:${set.id}`, goal: { ...base, kind: "learning", setId: set.id } });
  return result;
}

export const levelDescription: Record<Experience, string> = {
  new: "I have never solved a puzzle on my own.",
  beginner: "I can solve with a beginner method.",
  intermediate: "I use a speed method and know some algorithms.",
  advanced: "I know full sets and chase every tenth.",
};

export const puzzleLabel = (id: PuzzleId) => puzzleInfo(id).label;
