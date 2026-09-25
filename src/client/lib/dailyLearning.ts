import type { CaseDto } from "../../shared/types";
import { puzzleOf } from "../../shared/puzzles";

export const LEARNING_TRACKS = ["F2L", "OLL", "PLL"] as const;
export type LearningTrack = typeof LEARNING_TRACKS[number];
export type LearningMode = "practice" | "review" | LearningTrack;
export interface DailyAssignment { caseId: string; assignedOn: string; completedOn?: string }
export interface LearningPlan { mode: LearningMode; tracks: Partial<Record<LearningTrack, DailyAssignment>>; groupOrder?: Partial<Record<LearningTrack, string[]>> }
export const EMPTY_LEARNING_PLAN: LearningPlan = { mode: "practice", tracks: {} };
export const learningKey = (userId: string) => `cubix.learning.v1:${userId}`;
export const isLearningTrack = (value: unknown): value is LearningTrack => LEARNING_TRACKS.includes(value as LearningTrack);
export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function learningCases(cases: readonly CaseDto[], track: LearningTrack, order?: readonly string[]): CaseDto[] {
  // Only the core CFOP sets: no 2-look, advanced F2L or cases of other puzzles.
  const pool = cases.filter(c => puzzleOf(c) === "333" && c.set === track.toLowerCase());
  const groups = orderedGroups(pool, order);
  return pool.sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group));
}
/** Unlearned cases stay pinned across repetitions and restarts. Marking a case learned
 * immediately picks the first remaining case in the chosen group order. */
export function dailyAssignment(previous: DailyAssignment | undefined, cases: readonly CaseDto[], learned: ReadonlySet<string>, today: string): DailyAssignment | undefined {
  if (previous && cases.some(c => c.id === previous.caseId)) {
    if (!learned.has(previous.caseId)) return previous.completedOn ? { caseId: previous.caseId, assignedOn: previous.assignedOn } : previous;
  }
  const next = cases.find(c => !learned.has(c.id));
  return next ? { caseId: next.id, assignedOn: today } : undefined;
}
export function learningStatus(cases: readonly CaseDto[], learned: ReadonlySet<string>): string {
  const count = cases.filter(c => learned.has(c.id)).length;
  const status = count === cases.length && cases.length > 0 ? "Track complete" : "Algorithm to learn";
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

/** Keep every catalogue group exactly once, appending new groups after saved preferences. */
export function orderedGroups(cases: readonly CaseDto[], saved: readonly string[] = []): string[] {
  const groups = [...new Set(cases.map(c => c.group))];
  return [...new Set([...saved.filter(group => groups.includes(group)), ...groups])];
}
export function moveLearningGroup(plan: LearningPlan, track: LearningTrack, cases: readonly CaseDto[], index: number, direction: number): LearningPlan {
  const groups = orderedGroups(learningCases(cases, track), plan.groupOrder?.[track]);
  const target = index + direction;
  if (!Number.isInteger(index) || ![-1, 1].includes(direction) || index < 0 || index >= groups.length || target < 0 || target >= groups.length) return plan;
  [groups[index], groups[target]] = [groups[target]!, groups[index]!];
  return { ...plan, groupOrder: { ...plan.groupOrder, [track]: groups } };
}
