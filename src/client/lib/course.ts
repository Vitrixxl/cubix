/**
 * The Learn section's logic, shared by the web app and Android: which method of a puzzle is being learnt, the step it
 * stands on and the learned state of the algorithms the catalogue does not hold. Catalogue cases
 * keep their own learned marks (synchronised with the account); everything here is a device preference of the account.
 */
import { METHODS, type MethodAlgorithm, type MethodLevel, type MethodStep, type SolvingMethod } from "../../shared/methods";
import { invertAlg } from "../../shared/cube";
import { puzzleOf, type PuzzleId } from "../../shared/puzzles";
import type { CaseDto, SetDto } from "../../shared/types";
import { groupCases } from "./practiceCatalog";
import { msg } from "../i18n/msg";

export interface CourseEntry {
  /** Index of the step shown. */
  step: number;
  /** Inline algorithms marked learned, by `algId`, and intuitive steps marked mastered, by `stepId`. */
  learned: string[];
}
export interface CourseProgress {
  /** The method last opened on each puzzle. */
  methods: Partial<Record<PuzzleId, string>>;
  /** Each started course, by `puzzle:method`. */
  courses: Record<string, CourseEntry>;
}
export const EMPTY_COURSE_PROGRESS: CourseProgress = { methods: {}, courses: {} };
/** The preference holding an account's progress, beside its learning plan (`cubix.learning.v1:<id>`). */
export const courseStorageKey = (userId: string) => `cubix.course.v1:${userId}`;

export const LEVEL_LABEL: Record<MethodLevel, string> = { beginner: msg("Beginner"), intermediate: msg("Intermediate"), advanced: msg("Advanced") };

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
/** Whatever was stored, as a well-formed progress. */
export function readCourseProgress(raw: unknown): CourseProgress {
  if (!raw || typeof raw !== "object") return EMPTY_COURSE_PROGRESS;
  const value = raw as Partial<CourseProgress>;
  const methods: CourseProgress["methods"] = {};
  for (const [puzzle, method] of Object.entries(value.methods ?? {})) if (typeof method === "string") methods[puzzle as PuzzleId] = method;
  const courses: CourseProgress["courses"] = {};
  for (const [key, entry] of Object.entries(value.courses ?? {})) {
    if (!entry || typeof entry !== "object") continue;
    courses[key] = { step: Number.isInteger(entry.step) && entry.step >= 0 ? entry.step : 0, learned: strings(entry.learned) };
  }
  return { methods, courses };
}

const slug = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const stepId = (step: Pick<MethodStep, "title">) => slug(step.title);
export const algId = (step: Pick<MethodStep, "title">, alg: Pick<MethodAlgorithm, "name">) => `${stepId(step)}:${slug(alg.name)}`;
const courseKey = (puzzle: PuzzleId, method: string) => `${puzzle}:${method}`;

export const methodOf = (puzzle: PuzzleId, id: string | undefined): SolvingMethod | undefined => METHODS[puzzle]?.find(m => m.id === id);
/** The method to start with on a puzzle: its first beginner one. */
export const recommendedMethod = (puzzle: PuzzleId) => METHODS[puzzle].find(m => m.level === "beginner")?.id;

/** A course's progress, its step kept within the method. */
export function courseEntry(progress: CourseProgress, puzzle: PuzzleId, method: string): CourseEntry {
  const entry = progress.courses[courseKey(puzzle, method)];
  const steps = methodOf(puzzle, method)?.steps.length ?? 1;
  return entry ? { ...entry, step: Math.min(entry.step, steps - 1) } : { step: 0, learned: [] };
}
function update(progress: CourseProgress, puzzle: PuzzleId, method: string, change: (entry: CourseEntry) => CourseEntry): CourseProgress {
  return { methods: { ...progress.methods, [puzzle]: method }, courses: { ...progress.courses, [courseKey(puzzle, method)]: change(courseEntry(progress, puzzle, method)) } };
}
const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter(v => v !== id) : [...list, id]);

/** Opening a method makes it the puzzle's course and starts it where it was left. */
export const openCourse = (progress: CourseProgress, puzzle: PuzzleId, method: string) => update(progress, puzzle, method, entry => entry);
export function goToStep(progress: CourseProgress, puzzle: PuzzleId, method: string, index: number): CourseProgress {
  const steps = methodOf(puzzle, method)?.steps.length ?? 0;
  if (!steps) return progress;
  return update(progress, puzzle, method, entry => ({ ...entry, step: Math.max(0, Math.min(steps - 1, index)) }));
}
export const toggleAlgLearned = (progress: CourseProgress, puzzle: PuzzleId, method: string, id: string) =>
  update(progress, puzzle, method, entry => ({ ...entry, learned: toggle(entry.learned, id) }));

/** The catalogue sets of a step that exist for the puzzle, in the step's order. */
export function stepSets<S extends Pick<SetDto, "id" | "puzzle_id" | "cube_size">>(step: MethodStep, sets: readonly S[], puzzle: PuzzleId): S[] {
  return (step.sets ?? []).flatMap(id => sets.filter(s => s.id === id && puzzleOf(s) === puzzle));
}
/** A set's cases grouped by family, in the catalogue's order. */
export const setGroups = <C extends Pick<CaseDto, "set" | "group">>(cases: readonly C[], setId: string): [string, C[]][] =>
  [...groupCases(cases.filter(c => c.set === setId))];

/** How many algorithms a step teaches: the cases of its sets and its own algorithms. */
export function stepAlgorithmCount(step: MethodStep, cases: readonly Pick<CaseDto, "set">[]): number {
  return (step.algs?.length ?? 0) + (step.sets ?? []).reduce((sum, id) => sum + cases.filter(c => c.set === id).length, 0);
}
/** A method at a glance: its steps and its algorithms, a set shared by two steps counted once. */
export function methodFacts(method: SolvingMethod, cases: readonly Pick<CaseDto, "set">[]) {
  const sets = new Set(method.steps.flatMap(step => step.sets ?? []));
  const inline = method.steps.reduce((sum, step) => sum + (step.algs?.length ?? 0), 0);
  return { steps: method.steps.length, algorithms: inline + cases.filter(c => sets.has(c.set)).length };
}
/**
 * Where a course stands: whether it was opened, the step shown, and its steps done out of those that can be: with
 * algorithms, or intuitive; a step whose algorithms are still to come is not counted.
 */
export function methodProgress(progress: CourseProgress, puzzle: PuzzleId, method: SolvingMethod, cases: readonly Pick<CaseDto, "id" | "set">[], learned: ReadonlySet<string>) {
  const started = !!progress.courses[courseKey(puzzle, method.id)];
  const entry = courseEntry(progress, puzzle, method.id);
  const counted = method.steps.filter(step => !step.missing || stepAlgorithmCount(step, cases) > 0);
  const done = counted.filter(step => stepDone(step, cases, learned, entry)).length, total = counted.length;
  return { started, done, total, step: entry.step, learned: total > 0 && done === total };
}
/**
 * The share of a method's algorithms known, from 0 to 1, for its bar: it reaches 1 (learned, in green) only once the
 * course is learned, intuitive steps mastered included.
 */
export function methodShare(method: SolvingMethod, cases: readonly Pick<CaseDto, "id" | "set">[], learned: ReadonlySet<string>, progress: CourseProgress, puzzle: PuzzleId) {
  const algorithms = methodFacts(method, cases).algorithms;
  const share = algorithms ? methodLearned(method, cases, learned, courseEntry(progress, puzzle, method.id)) / algorithms : 0;
  return methodProgress(progress, puzzle, method, cases, learned).learned ? 1 : Math.min(share, 0.99);
}
/** An intuitive step marked mastered: nothing to learn, so it is the learner's word. */
export const stepMastered = (step: Pick<MethodStep, "title">, entry: CourseEntry) => entry.learned.includes(stepId(step));
/** A step is done once every algorithm it teaches is learned; an intuitive one once marked mastered; one whose algorithms are to come never is. */
export function stepDone(step: MethodStep, cases: readonly Pick<CaseDto, "id" | "set">[], learned: ReadonlySet<string>, entry: CourseEntry) {
  const count = stepLearned(step, cases, learned, entry);
  return count.total > 0 ? count.learned === count.total : !step.missing && stepMastered(step, entry);
}

/** The set a step opens on: the first one with cases still to learn, the first otherwise. */
export function firstOpenSet<S extends Pick<SetDto, "id">>(sets: readonly S[], cases: readonly Pick<CaseDto, "id" | "set">[], learned: ReadonlySet<string>): S | undefined {
  return sets.find(s => cases.some(c => c.set === s.id && !learned.has(c.id))) ?? sets[0];
}
/** Learned algorithms of a step against its total: catalogue cases by their marks, the step's own by the course's. */
export function stepLearned(step: MethodStep, cases: readonly Pick<CaseDto, "id" | "set">[], learned: ReadonlySet<string>, entry: CourseEntry) {
  const members = cases.filter(c => step.sets?.includes(c.set));
  const own = step.algs ?? [];
  return {
    learned: members.filter(c => learned.has(c.id)).length + own.filter(a => entry.learned.includes(algId(step, a))).length,
    total: members.length + own.length,
  };
}

/** Learned algorithms of a whole method, a set shared by two steps counted once (out of `methodFacts`' algorithms). */
export function methodLearned(method: SolvingMethod, cases: readonly Pick<CaseDto, "id" | "set">[], learned: ReadonlySet<string>, entry: CourseEntry) {
  const sets = new Set(method.steps.flatMap(step => step.sets ?? []));
  const own = method.steps.flatMap(step => (step.algs ?? []).map(a => algId(step, a)));
  return cases.filter(c => sets.has(c.set) && learned.has(c.id)).length + own.filter(id => entry.learned.includes(id)).length;
}

/** The case an inline algorithm is shown on: its own setup, or the algorithm undone from a solved cube, rotations and brackets included. */
export const algSetup = (alg: Pick<MethodAlgorithm, "alg" | "setup">) => alg.setup ?? invertAlg(alg.alg);
