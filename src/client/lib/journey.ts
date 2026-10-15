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
  /** The 3×3 the player mains, from `CUBES_333` or typed: 60 characters at most. */
  mainCube?: string;
  completedAt: string;
}
/** Entries other than the profile (personal goals, removed) are ignored. */
export type JourneyEntry = JourneyProfile;
export type Journey = Record<string, JourneyEntry | null>;
export interface JourneyEntryDto { id: number; key: string; value: JourneyEntry | null; updated_at: string }
export const PROFILE_KEY = "profile";
/** A profile without the puzzles the app retired (Clock), so one saved when they existed stays valid. */
export function withoutRetired(value: unknown): unknown {
  const v = value as Record<string, any> | null;
  if (v?.kind !== "profile" || !Array.isArray(v.knownPuzzles)) return value;
  const keep = (map: unknown) => map && typeof map === "object" && !Array.isArray(map) ? Object.fromEntries(Object.entries(map).filter(([p]) => isPuzzle(p))) : map;
  const out: Record<string, any> = { ...v, knownPuzzles: v.knownPuzzles.filter(isPuzzle) };
  if (Array.isArray(v.learningPuzzles)) out.learningPuzzles = v.learningPuzzles.filter(isPuzzle);
  for (const key of ["knownMethods", "learningMethods", "bests"]) if (key in v) out[key] = keep(v[key]);
  if (v.priority != null && !isPuzzle(v.priority)) {
    out.priority = null; out.learningPuzzles = []; delete out.priorityMethod; delete out.learningMethods;
  }
  return out;
}
export const journeyProfile = (journey: Journey): JourneyProfile | undefined => journey.profile?.kind === "profile" ? journey.profile : undefined;
/** Whether the profile does not list a puzzle as one the player can solve yet. */
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
/** The profile the introduction saves: its puzzles, methods and bests over the saved one, whose other fields (the main
 *  cube, an old level) stay; the old learning plan goes with the priority it hangs on. */
export function introducedProfile(existing: JourneyProfile | undefined, knownPuzzles: PuzzleId[], knownMethods: JourneyProfile["knownMethods"], bests: JourneyProfile["bests"]): JourneyProfile {
  const { learningPuzzles: _p, learningMethods: _m, priorityMethod: _pm, bests: _b, ...rest } = existing ?? {};
  return { ...rest, kind: "profile", knownPuzzles, knownMethods, priority: null, ...(bests && Object.keys(bests).length ? { bests } : {}), completedAt: existing?.completedAt ?? new Date().toISOString() };
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
  return v.kind === "profile" && (v.mainCube === undefined || typeof v.mainCube === "string" && !!v.mainCube.trim() && v.mainCube.length <= 60) && (v.level === undefined || LEVEL_IDS.includes(v.level as Experience)) && (v.priority === null || isPuzzle(v.priority)) && validAt(v.completedAt)
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
 * native: the view registered under that key), so the tour shows a part of every tab rather than only its button. Web
 * and phone follow this order: the timer, then Learn, Training, Algs, Duel and Me.
 */
export const TOUR_STEPS = [
  { page: "playground", target: "playground", inner: "scramble", title: "Scramble your cube", body: "Turn your cube with these moves. A new scramble is ready after every solve." },
  { page: "playground", target: "playground", inner: "timer", title: "Time your solve", body: "Hold to arm the timer, release to start, then press again when the cube is solved. Times are saved on this device first, then synced." },
  { page: "playground", target: "playground", inner: "session", title: "Follow your session", body: "Your best single, averages and every time of the session update after each solve." },
  { page: "learn", target: "learn", inner: "learn", title: "Learn a new puzzle", body: "Pick a method and follow it step by step, with every algorithm of each step." },
  { page: "training", target: "training", inner: "training", title: "Practise with a purpose", body: "Drill the cases you learned, the slowest first, or plan the cross." },
  { page: "algorithms", target: "algorithms", inner: "algorithms", title: "Find the right algorithm", body: "Browse the cases of every set, play their moves and mark the ones you know." },
  { page: "duel", target: "duel", inner: "duel", title: "Race when you are ready", body: "Challenge another cuber over five scrambles. Your battles stay on your profile." },
  { page: "profile", target: "profile", inner: "profile-overview", title: "Watch your progress", body: "Your times, practice and results live here. You can replay this tour from the guides." },
] as const;

/** Someone who solves no puzzle yet: the course they start on, the 3×3 Beginner method. */
export const BEGINNER_COURSE = { puzzle: "333", method: "beginner" } as const satisfies { puzzle: PuzzleId; method: string };
export const isBeginner = (profile: JourneyProfile | undefined) => !!profile && !profile.knownPuzzles.length;
/** The tour for this profile: a beginner, who cannot time a solve yet, skips the timer's steps (and lands on the course after). */
export const tourSteps = (profile: JourneyProfile | undefined) => isBeginner(profile) ? TOUR_STEPS.filter(st => st.page !== "playground") : TOUR_STEPS;
