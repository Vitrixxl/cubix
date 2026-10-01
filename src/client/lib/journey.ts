/** Personal setup and goals. Stored per account, one independently synchronized entry per goal. */
import { isPuzzle, puzzleOf, scrambleTypeOf, solveModeOf, puzzleInfo, type PuzzleId, type SolveMode } from "../../shared/puzzles";
import type { CaseDto, SolveDto } from "../../shared/types";
import { effective, fmtTime, rollingAverages } from "./format";
import { parseTypedTime } from "./format";
import { METHODS } from "../../shared/methods";

/** Older profiles still carry a self-assessed level; setup no longer asks for it. */
const LEVEL_IDS = ["new", "beginner", "intermediate", "advanced"] as const;
export type Experience = typeof LEVEL_IDS[number];
export interface JourneyProfile {
  kind: "profile";
  level?: Experience;
  knownPuzzles: PuzzleId[];
  knownMethods?: Partial<Record<PuzzleId, string[]>>;
  priority: PuzzleId | null;
  learningPuzzles?: PuzzleId[];
  learningMethods?: Partial<Record<PuzzleId, string[]>>;
  priorityMethod?: string;
  completedAt: string;
}
interface GoalBase { puzzle: PuzzleId; createdAt: string; dueDate?: string }
export type PersonalGoal = GoalBase & (
  { kind: "time"; metric: "single" | "ao5"; targetMs: number; solveMode: SolveMode } |
  { kind: "learning"; setId: string | null }
);
export type JourneyEntry = JourneyProfile | PersonalGoal;
export type Journey = Record<string, JourneyEntry | null>;
export interface JourneyEntryDto { id: number; key: string; value: JourneyEntry | null; updated_at: string }
export const PROFILE_KEY = "profile";
export const goalKey = () => `goal:${crypto.randomUUID()}`;
/** Goals are entered in seconds (20 means 20 seconds), or as m:ss.cc. */
export function parseGoalTarget(text: string): number | null {
  const value = text.trim().replace(",", ".");
  const ms = value.includes(":") ? parseTypedTime(value) : /^\d+(\.\d{1,3})?$/.test(value) ? Math.round(Number(value) * 1000) : null;
  return ms !== null && ms > 0 && ms <= 86_400_000 ? ms : null;
}
export const journeyProfile = (journey: Journey): JourneyProfile | undefined => journey.profile?.kind === "profile" ? journey.profile : undefined;
/** The sections a puzzle opens once it can be solved; until then only Learn (and the account) are open on it. */
export const LOCKED_PAGES = ["playground", "algorithms", "training", "duel"] as const;
/** A puzzle is locked while the profile does not list it as solved: its course comes first. */
export const puzzleLocked = (profile: JourneyProfile | undefined, puzzle: PuzzleId) => !!profile && !profile.knownPuzzles.includes(puzzle);
/** The profile once `puzzle` can be solved, with the method that was learnt (or the tutorial skipped). */
export function withKnownPuzzle(profile: JourneyProfile, puzzle: PuzzleId, method?: string): JourneyProfile {
  const methods = profile.knownMethods?.[puzzle] ?? [];
  const known = METHODS[puzzle].some(m => m.id === method) && !methods.includes(method!) ? [...methods, method!] : methods;
  return {
    ...profile,
    knownPuzzles: profile.knownPuzzles.includes(puzzle) ? profile.knownPuzzles : [...profile.knownPuzzles, puzzle],
    ...(known.length ? { knownMethods: { ...profile.knownMethods, [puzzle]: known } } : {}),
  };
}
/** Read existing single-priority profiles without rewriting an account's saved choices. */
export function learningPlan(profile?: JourneyProfile) {
  return {
    puzzles: profile?.learningPuzzles ?? (profile?.priority ? [profile.priority] : []),
    methods: profile?.learningMethods ?? (profile?.priority && profile.priorityMethod ? { [profile.priority]: [profile.priorityMethod] } : {}),
  };
}
export const personalGoals = (journey: Journey): [string, PersonalGoal][] => Object.entries(journey)
  .filter((entry): entry is [string, PersonalGoal] => entry[1] !== null && entry[1].kind !== "profile")
  .sort((a, b) => a[1].createdAt.localeCompare(b[1].createdAt) || a[0].localeCompare(b[0]));
const validAt = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export const validDueDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value + "T00:00:00.000Z")) && new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) === value;
export function validJourneyEntry(key: string, value: unknown, cases: readonly CaseDto[]): value is JourneyEntry | null {
  if (key !== PROFILE_KEY && !/^goal:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key)) return false;
  if (value === null) return key !== PROFILE_KEY;
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (key === PROFILE_KEY) return v.kind === "profile" && (v.level === undefined || LEVEL_IDS.includes(v.level as Experience)) && (v.priority === null || isPuzzle(v.priority)) && validAt(v.completedAt)
    && Array.isArray(v.knownPuzzles) && v.knownPuzzles.length <= 11 && v.knownPuzzles.every(isPuzzle) && new Set(v.knownPuzzles).size === v.knownPuzzles.length
    && (v.priorityMethod === undefined || typeof v.priorityMethod === "string" && isPuzzle(v.priority) && METHODS[v.priority].some(m => m.id === v.priorityMethod))
    && (v.learningPuzzles === undefined || Array.isArray(v.learningPuzzles) && v.learningPuzzles.length <= 11 && v.learningPuzzles.every(isPuzzle) && new Set(v.learningPuzzles).size === v.learningPuzzles.length && (v.priority === null ? !v.learningPuzzles.length : v.learningPuzzles.includes(v.priority)))
    && (v.learningMethods === undefined || v.learningMethods !== null && typeof v.learningMethods === "object" && !Array.isArray(v.learningMethods) && Array.isArray(v.learningPuzzles) && Object.entries(v.learningMethods).every(([p, methods]) => isPuzzle(p) && (v.learningPuzzles as string[]).includes(p) && Array.isArray(methods) && methods.every(id => typeof id === "string" && METHODS[p].some(m => m.id === id)) && new Set(methods).size === methods.length))
    && (v.knownMethods === undefined || v.knownMethods !== null && typeof v.knownMethods === "object" && !Array.isArray(v.knownMethods) && Object.entries(v.knownMethods).every(([p, methods]) => isPuzzle(p) && (v.knownPuzzles as string[]).includes(p) && Array.isArray(methods) && methods.every(id => typeof id === "string" && METHODS[p].some(m => m.id === id)) && new Set(methods).size === methods.length));
  if (!isPuzzle(v.puzzle) || !validAt(v.createdAt) || v.dueDate !== undefined && !validDueDate(v.dueDate)) return false;
  if (v.kind === "time") return ["single", "ao5"].includes(v.metric as string) && ["standard", "one-handed", "blindfolded"].includes(v.solveMode as string)
    && Number.isInteger(v.targetMs) && Number(v.targetMs) > 0 && Number(v.targetMs) <= 86_400_000;
  return v.kind === "learning" && (v.setId === null || typeof v.setId === "string" && cases.some(c => c.set === v.setId && puzzleOf(c) === v.puzzle));
}
export function goalTitle(goal: PersonalGoal, sets: readonly { id: string; label: string }[] = []): string {
  const puzzle = puzzleInfo(goal.puzzle).label;
  if (goal.kind === "learning") return goal.setId ? `Learn ${sets.find(s => s.id === goal.setId)?.label ?? goal.setId} · ${puzzle}` : `Learn to solve ${puzzle}`;
  const mode = goal.solveMode === "standard" ? "" : goal.solveMode === "one-handed" ? " · one-handed" : " · blindfolded";
  return `Sub-${fmtTime(goal.targetMs)} ${goal.metric === "ao5" ? "average of 5" : "single"} · ${puzzle}${mode}`;
}
export interface GoalProgress { complete: boolean; ratio: number; detail: string; value: number | null; total?: number }
/** Only standard full scrambles count toward time goals; +2 and DNF affect single and Ao5 normally. */
export function goalProgress(goal: PersonalGoal, solves: readonly SolveDto[], learned: ReadonlySet<string>, cases: readonly CaseDto[], profile?: JourneyProfile): GoalProgress {
  if (goal.kind === "learning") {
    const pool = goal.setId ? cases.filter(c => c.set === goal.setId && puzzleOf(c) === goal.puzzle) : [];
    const count = goal.setId ? pool.filter(c => learned.has(c.id)).length : Number(profile?.knownPuzzles.includes(goal.puzzle) ?? false);
    const total = goal.setId ? pool.length : 1;
    return { complete: total > 0 && count >= total, ratio: total ? count / total : 0, value: count, total,
      detail: goal.setId ? `${count} / ${total} cases learned` : count ? "You can solve this puzzle" : "Mark it complete when you can solve it" };
  }
  const times = solves.filter(s => !s.case_id && puzzleOf(s) === goal.puzzle && solveModeOf(s) === goal.solveMode && scrambleTypeOf(s) === "normal")
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id).map(s => effective(s.time_ms, s.penalty));
  const values = goal.metric === "ao5" ? rollingAverages(times, 5) : times;
  let best: number | null = null;
  for (const value of values) if (value !== null && Number.isFinite(value) && (best === null || value < best)) best = value;
  const complete = best !== null && best < goal.targetMs;
  return { complete, ratio: best === null ? 0 : complete ? 1 : Math.min(.99, goal.targetMs / Math.max(1, best)), value: best,
    detail: best === null ? `No ${goal.metric === "ao5" ? "average of 5" : "solve"} yet` : `Best ${fmtTime(best)} · target ${fmtTime(goal.targetMs)}` };
}

/**
 * Shared copy and destinations; platform-specific tours only handle placement, focus and transitions. Each step opens
 * `page`, highlights its tab (`target`) and, inside the page, the element tagged `inner` (web: `data-tour="<inner>"`,
 * native: the view registered under that key), so the tour shows a part of every tab rather than only its button.
 */
export const TOUR_STEPS = [
  { page: "playground", target: "playground", inner: "scramble", title: "Scramble your cube", body: "Turn your cube with these moves. A new scramble is ready after every solve." },
  { page: "playground", target: "playground", inner: "timer", title: "Time your solve", body: "Hold to arm the timer, release to start, then press again when the cube is solved. Times are saved on this device first, then synced." },
  { page: "playground", target: "playground", inner: "session", title: "Follow your session", body: "Your best single, averages and every time of the session update after each solve." },
  { page: "algorithms", target: "algorithms", inner: "algorithms", title: "Find the right algorithm", body: "Browse the cases of every set, play their moves and mark the ones you know." },
  { page: "training", target: "training", inner: "training", title: "Practise with a purpose", body: "Drill chosen cases, review what you know or learn one new case a day." },
  { page: "duel", target: "duel", inner: "duel", title: "Race when you are ready", body: "Challenge another cuber over five scrambles. Your battles stay on your profile." },
  { page: "learn", target: "learn", inner: "learn", title: "Learn a new puzzle", body: "Pick a method and follow it step by step, with every algorithm of each step." },
  { page: "profile", target: "profile", inner: "profile-goals", title: "Keep your goals in sight", body: "Your goals, progress and results live here. You can replay this tour from the profile or the guides." },
] as const;
export type TourStep = typeof TOUR_STEPS[number];
