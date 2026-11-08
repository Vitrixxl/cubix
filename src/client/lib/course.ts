/**
 * The Learn section's logic, shared by the web app and Android: which method of a puzzle is being learnt, the step it
 * stands on and the learned state of the algorithms the catalogue does not hold. Catalogue cases
 * keep their own learned marks (synchronised with the account); everything here is a device preference of the account.
 */
import { BLD_METHODS, METHODS, type MethodAlgorithm, type MethodLevel, type MethodStep, type SolvingMethod } from "../../shared/methods";
import { BASICS, CONCEPTS, type Lesson, type LessonPage } from "../../shared/lessons";
import { invertAlg } from "../../shared/cube";
import { puzzleOf, type PuzzleId, type SolveMode } from "../../shared/puzzles";
import type { CaseDto, SetDto } from "../../shared/types";
import { msg } from "../i18n/msg";

export interface CourseEntry {
  /** Index of the step shown. */
  step: number;
  /** Inline algorithms marked learned, by `algId`, and intuitive steps marked mastered, by `stepId`. */
  learned: string[];
  /** The course's lesson shown, among all its chapters (`courseChapters`). */
  lesson?: number;
  /** The lessons finished, by their ids. */
  done?: string[];
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
    courses[key] = { step: Number.isInteger(entry.step) && entry.step >= 0 ? entry.step : 0, learned: strings(entry.learned), ...(Number.isInteger(entry.lesson) && entry.lesson! >= 0 ? { lesson: entry.lesson } : {}), ...(strings(entry.done).length ? { done: strings(entry.done) } : {}) };
  }
  return { methods, courses };
}

const slug = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const stepId = (step: Pick<MethodStep, "title">) => slug(step.title);
export const algId = (step: Pick<MethodStep, "title">, alg: Pick<MethodAlgorithm, "name">) => `${stepId(step)}:${slug(alg.name)}`;
const courseKey = (puzzle: PuzzleId, method: string) => `${puzzle}:${method}`;

/** The methods Learn offers for an event: a blindfolded one's (Old Pochmann…), the puzzle's own otherwise. */
export const methodsFor = (puzzle: PuzzleId, mode: SolveMode = "standard"): SolvingMethod[] =>
  mode === "blindfolded" || mode === "multi-blind" ? BLD_METHODS[puzzle] ?? [] : METHODS[puzzle] ?? [];
/** A method by its id: among the event's methods when `mode` is given, among all the puzzle's otherwise (a course's link). */
export const methodOf = (puzzle: PuzzleId, id: string | undefined, mode?: SolveMode): SolvingMethod | undefined =>
  (mode ? methodsFor(puzzle, mode) : [...methodsFor(puzzle), ...methodsFor(puzzle, "blindfolded")]).find(m => m.id === id);
/** The method to start with on an event: its first beginner one. */
export const recommendedMethod = (puzzle: PuzzleId, mode?: SolveMode) => methodsFor(puzzle, mode).find(m => m.level === "beginner")?.id;

/** A course's progress, its step kept within the method. */
export function courseEntry(progress: CourseProgress, puzzle: PuzzleId, method: string): CourseEntry {
  const entry = progress.courses[courseKey(puzzle, method)];
  const steps = methodOf(puzzle, method)?.steps.length ?? 1;
  return entry ? { ...entry, step: Math.min(entry.step, steps - 1) } : { step: 0, learned: [] };
}
function update(progress: CourseProgress, puzzle: PuzzleId, method: string, change: (entry: CourseEntry) => CourseEntry): CourseProgress {
  return { methods: { ...progress.methods, [puzzle]: method }, courses: { ...progress.courses, [courseKey(puzzle, method)]: change(courseEntry(progress, puzzle, method)) } };
}
/** The list with the item added, or taken out if it was in it. */
export const toggled = <T,>(list: readonly T[], item: T): T[] => (list.includes(item) ? list.filter(v => v !== item) : [...list, item]);

/** Opening a method makes it the puzzle's course and starts it where it was left. */
export const openCourse = (progress: CourseProgress, puzzle: PuzzleId, method: string) => update(progress, puzzle, method, entry => entry);
export function goToStep(progress: CourseProgress, puzzle: PuzzleId, method: string, index: number): CourseProgress {
  const steps = methodOf(puzzle, method)?.steps.length ?? 0;
  if (!steps) return progress;
  return update(progress, puzzle, method, entry => ({ ...entry, step: Math.max(0, Math.min(steps - 1, index)) }));
}
export const toggleAlgLearned = (progress: CourseProgress, puzzle: PuzzleId, method: string, id: string) =>
  update(progress, puzzle, method, entry => ({ ...entry, learned: toggled(entry.learned, id) }));

/** The catalogue sets of a step that exist for the puzzle, in the step's order. */
export function stepSets<S extends Pick<SetDto, "id" | "puzzle_id" | "cube_size">>(step: MethodStep, sets: readonly S[], puzzle: PuzzleId): S[] {
  return (step.sets ?? []).flatMap(id => sets.filter(s => s.id === id && puzzleOf(s) === puzzle));
}

/** How many algorithms a step teaches: the cases of its sets and its own algorithms. */
export function stepAlgorithmCount(step: MethodStep, cases: readonly Pick<CaseDto, "set">[]): number {
  return (step.algs?.length ?? 0) + (step.sets ?? []).reduce((sum, id) => sum + cases.filter(c => c.set === id).length, 0);
}
/** The sets a method's steps teach, in their order, a set shared by two steps once. */
export const methodSetIds = (method: SolvingMethod | undefined) => [...new Set((method?.steps ?? []).flatMap(step => step.sets ?? []))];
/** A method at a glance: its steps and its algorithms, a set shared by two steps counted once. */
export function methodFacts(method: SolvingMethod, cases: readonly Pick<CaseDto, "set">[]) {
  const sets = new Set(methodSetIds(method));
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
/** `count`: the step's `stepLearned`, when the caller has it already. */
export function stepDone(step: MethodStep, cases: readonly Pick<CaseDto, "id" | "set">[], learned: ReadonlySet<string>, entry: CourseEntry, count = stepLearned(step, cases, learned, entry)) {
  return count.total > 0 ? count.learned === count.total : !step.missing && stepMastered(step, entry);
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
  const sets = new Set(methodSetIds(method));
  const own = method.steps.flatMap(step => (step.algs ?? []).map(a => algId(step, a)));
  return cases.filter(c => sets.has(c.set) && learned.has(c.id)).length + own.filter(id => entry.learned.includes(id)).length;
}

/** The case an inline algorithm is shown on: its own setup, or the algorithm undone from a solved cube, rotations and brackets included. */
export const algSetup = (alg: Pick<MethodAlgorithm, "alg" | "setup">) => alg.setup ?? invertAlg(alg.alg);

/** A step's before and after pictures (see `MethodStep.picture`): the puzzle before and after it, as moves from solved, and the pieces shown. */
export function stepPicture(method: SolvingMethod, index: number) {
  const step = method.steps[index]!, picture = step.picture ?? {};
  return { before: picture.from ?? method.steps[index - 1]?.picture?.done ?? "", after: picture.done ?? "", mask: picture.mask ?? step.mask ?? "full", held: !!picture.held };
}

export interface CourseChapter { id: string; title: string; lessons: Lesson[] }
const stepLesson = (puzzle: PuzzleId, method: SolvingMethod, index: number): Lesson => {
  const step = method.steps[index]!, picture = stepPicture(method, index), pages: LessonPage[] = [
    { title: step.title, text: step.text, picture: { setup: picture.after, mask: picture.mask, held: picture.held } },
  ];
  if (step.tips?.length) pages.push({ title: msg("To remember"), text: "", points: step.tips });
  for (const a of [...(step.algs ?? []), ...(step.help ?? [])]) pages.push({ title: a.name, text: a.note ?? "", alg: a.alg, algSetup: algSetup(a), mask: step.mask });
  if (step.sets?.length) pages.push({ title: msg("Its cases"), text: msg("Learn them one at a time: open a case, then follow its lesson."), sets: step.sets });
  if (assistedSteps(puzzle, method.id) > index) pages.push({ title: msg("On your own cube"), text: msg("Solve this step on your real cube, connected or read by the camera. Qbix shows which pieces matter."), ownCube: true, picture: { setup: picture.after, mask: picture.mask, held: picture.held } });
  return { id: stepId(step), title: step.title, pages };
};
/** The steps a course can play on the player's own cube (the methods `methodSolver.ts` plans), the 3×3's only. */
const OWN_CUBE: Record<string, number> = { beginner: 6, cfop: 4, roux: 4, zz: 3 };
const assistedSteps = (puzzle: PuzzleId, method: string) => (puzzle === "333" ? OWN_CUBE[method] ?? 0 : 0);
/** A method's course from zero: the 3×3's basics, what the method rests on, then each of its steps. */
export function courseChapters(puzzle: PuzzleId, method: SolvingMethod): CourseChapter[] {
  const concepts = CONCEPTS[method.id] ?? [];
  return [
    ...(puzzle === "333" ? [{ id: "basics", title: msg("The basics"), lessons: BASICS }] : []),
    ...(concepts.length ? [{ id: "concepts", title: msg("The ideas"), lessons: concepts }] : []),
    { id: "steps", title: msg("The steps"), lessons: method.steps.map((_, i) => stepLesson(puzzle, method, i)) },
  ];
}
export const courseLessons = (chapters: readonly CourseChapter[]) => chapters.flatMap((chapter) => chapter.lessons.map((lesson) => ({ chapter, lesson, key: `${chapter.id}:${lesson.id}` })));
/** The course's progress with `index` as its lesson, and `done` among those finished when given. */
export function goToLesson(progress: CourseProgress, puzzle: PuzzleId, method: string, index: number, done?: string): CourseProgress {
  return update(progress, puzzle, method, (entry) => ({ ...entry, lesson: index, done: done && !entry.done?.includes(done) ? [...(entry.done ?? []), done] : entry.done }));
}

