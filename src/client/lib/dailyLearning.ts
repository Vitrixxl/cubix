import type { CaseDto } from "../../shared/types";
import { puzzleOf } from "../../shared/puzzles";

export const LEARNING_TRACKS = ["F2L", "OLL", "PLL"] as const;
export type LearningTrack = typeof LEARNING_TRACKS[number];
export type LearningMode = "practice" | "review" | LearningTrack;
export interface DailyAssignment { caseId: string; assignedOn: string; completedOn?: string }
export interface LearningPlan { mode: LearningMode; tracks: Partial<Record<LearningTrack, DailyAssignment>> }
export const EMPTY_LEARNING_PLAN: LearningPlan = { mode: "practice", tracks: {} };
export const learningKey = (userId: string) => `cubix.learning.v1:${userId}`;
export const isLearningTrack = (value: unknown): value is LearningTrack => LEARNING_TRACKS.includes(value as LearningTrack);
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function learningCases(cases: readonly CaseDto[], track: LearningTrack): CaseDto[] {
  // Only the core CFOP sets: no 2-look, advanced F2L or cases of other puzzles.
  return cases.filter(c => puzzleOf(c) === "333" && c.set === track.toLowerCase());
}
/** Unlearned cases stay pinned even after missed days. Completion earns the rest of the day;
 * returning tomorrow picks the first remaining case in catalogue order. Undo reopens the same case. */
export function dailyAssignment(previous: DailyAssignment | undefined, cases: readonly CaseDto[], learned: ReadonlySet<string>, today: string): DailyAssignment | undefined {
  if (previous && cases.some(c => c.id === previous.caseId)) {
    if (!learned.has(previous.caseId)) return previous.completedOn ? { caseId: previous.caseId, assignedOn: previous.assignedOn } : previous;
    if (!previous.completedOn) return { ...previous, completedOn: today };
    if (previous.completedOn >= today) return previous;
  }
  const next = cases.find(c => !learned.has(c.id));
  return next ? { caseId: next.id, assignedOn: today } : previous && cases.some(c => c.id === previous.caseId) ? previous : undefined;
}
export function learningStatus(cases: readonly CaseDto[], learned: ReadonlySet<string>, assignment?: DailyAssignment): string {
  const count = cases.filter(c => learned.has(c.id)).length;
  const status = count === cases.length && cases.length > 0 ? "Track complete" : assignment && learned.has(assignment.caseId) ? "Done today · next tomorrow" : "Algorithm of the day";
  return `${status} · ${count}/${cases.length} learned`;
}

/** Revision always stays on the selected puzzle, across every stage and set. */
export function reviewCases(cases: readonly CaseDto[], learned: ReadonlySet<string>, puzzle: string): CaseDto[] {
  return cases.filter(c => puzzleOf(c) === puzzle && learned.has(c.id));
}
export function learningModeForPuzzle(mode: unknown, puzzle: string): LearningMode {
  return mode === "review" ? "review" : puzzle === "333" && isLearningTrack(mode) ? mode : "practice";
}
export function trainingModeOptions(puzzle: string): { value: LearningMode; label: string }[] {
  return [{ value: "practice", label: "Free practice" }, { value: "review", label: "Review learned" }, ...(puzzle === "333" ? LEARNING_TRACKS.map(value => ({ value, label: `Learn ${value}` })) : [])];
}
