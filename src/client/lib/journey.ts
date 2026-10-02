/** Personal setup: the puzzles and methods the player can solve, stored per account and synchronized. */
import { isPuzzle, type PuzzleId } from "../../shared/puzzles";
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
  /** The best single the player had on each known puzzle before Qbix, in milliseconds: optional. */
  bests?: Partial<Record<PuzzleId, number>>;
  completedAt: string;
}
/** Entries other than the profile (personal goals, removed) are ignored. */
export type JourneyEntry = JourneyProfile;
export type Journey = Record<string, JourneyEntry | null>;
export interface JourneyEntryDto { id: number; key: string; value: JourneyEntry | null; updated_at: string }
export const PROFILE_KEY = "profile";
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
const validAt = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export function validJourneyEntry(key: string, value: unknown): value is JourneyEntry {
  if (key !== PROFILE_KEY || !value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.kind === "profile" && (v.level === undefined || LEVEL_IDS.includes(v.level as Experience)) && (v.priority === null || isPuzzle(v.priority)) && validAt(v.completedAt)
    && Array.isArray(v.knownPuzzles) && v.knownPuzzles.length <= 11 && v.knownPuzzles.every(isPuzzle) && new Set(v.knownPuzzles).size === v.knownPuzzles.length
    && (v.priorityMethod === undefined || typeof v.priorityMethod === "string" && isPuzzle(v.priority) && METHODS[v.priority].some(m => m.id === v.priorityMethod))
    && (v.learningPuzzles === undefined || Array.isArray(v.learningPuzzles) && v.learningPuzzles.length <= 11 && v.learningPuzzles.every(isPuzzle) && new Set(v.learningPuzzles).size === v.learningPuzzles.length && (v.priority === null ? !v.learningPuzzles.length : v.learningPuzzles.includes(v.priority)))
    && (v.learningMethods === undefined || v.learningMethods !== null && typeof v.learningMethods === "object" && !Array.isArray(v.learningMethods) && Array.isArray(v.learningPuzzles) && Object.entries(v.learningMethods).every(([p, methods]) => isPuzzle(p) && (v.learningPuzzles as string[]).includes(p) && Array.isArray(methods) && methods.every(id => typeof id === "string" && METHODS[p].some(m => m.id === id)) && new Set(methods).size === methods.length))
    && (v.bests === undefined || v.bests !== null && typeof v.bests === "object" && !Array.isArray(v.bests) && Object.entries(v.bests).every(([p, ms]) => (v.knownPuzzles as string[]).includes(p) && Number.isInteger(ms) && (ms as number) > 0 && (ms as number) < 86_400_000))
    && (v.knownMethods === undefined || v.knownMethods !== null && typeof v.knownMethods === "object" && !Array.isArray(v.knownMethods) && Object.entries(v.knownMethods).every(([p, methods]) => isPuzzle(p) && (v.knownPuzzles as string[]).includes(p) && Array.isArray(methods) && methods.every(id => typeof id === "string" && METHODS[p].some(m => m.id === id)) && new Set(methods).size === methods.length));
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
  { page: "profile", target: "profile", inner: "profile-overview", title: "Watch your progress", body: "Your times, practice and results live here. You can replay this tour from the guides." },
] as const;
export type TourStep = typeof TOUR_STEPS[number];
