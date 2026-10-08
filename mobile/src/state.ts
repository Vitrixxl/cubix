import { DEFAULT_THEME, type ThemeId } from "../../src/client/lib/theme";
import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { eventInfo, eventOf, isPuzzle, puzzleInfo, puzzleOf, type EventId, type PuzzleId, type ScrambleType, type SolveMode } from "../../src/shared/puzzles";
import type { CaseDto, CaseStatsDto, SolveDto, Stage, UserDto } from "../../src/shared/types";
import type { TimeEntry } from "../../src/client/lib/format";
import { sets as catalogSets } from "../../src/client/local/catalog";
import { EMPTY_COURSE_PROGRESS, courseStorageKey, readCourseProgress, type CourseProgress } from "../../src/client/lib/course";
import { pageUrl, readRoute } from "../../src/client/lib/route";
import { api, authToken, local } from "./api";
import { storage } from "./platform/storage";

// ---------------------------------------------------------------------------
// Routing: one atom plus a bounded history so the Android back button behaves like the browser.
// ---------------------------------------------------------------------------
export type GuideId = "about" | "algorithms" | "training" | "timer" | "smartCube" | "duel" | "community" | "coaching" | "methods" | "notation" | "averages";
export type Route =
  | { page: "learn"; method?: string }
  | { page: "algorithms"; caseId?: string; caseIds?: string[] }
  | { page: "training"; autostart?: boolean }
  | { page: "playground" }
  | { page: "duel" }
  | { page: "profile"; mode?: ProfileMode; caseId?: string; group?: string }
  /** The beginner course's assisted solve (AssistedPage), over the course. */
  | { page: "assisted" }
  /**
   * The community (messages, friends, groups) and tournaments, opened from the account page or a link; `view` is the
   * address under the page, as on the web ("messages/4", "groups/2", "add/<username>", a tournament's id).
   */
  | { page: "community"; view?: string }
  | { page: "tournaments"; view?: string }
  /** A battle or a tournament match, live. */
  | { page: "match"; id: number }
  /** Coaching: its section and argument, as on the web ("dashboard", "coach/<id>", "messages/<id>", "call/<id>"); none opens the account's default. */
  | { page: "coaching"; view?: string };
/** A profile detail view; no mode shows the overview tiles. */
export type ProfileMode = "playground" | "training" | "achievements" | "duels";
/** The account's sections, as its tabs show them. */
export const PROFILE_SECTIONS: { id: ProfileMode | "overview"; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "playground", label: "Timer" }, { id: "training", label: "Training" },
  { id: "achievements", label: "Awards" }, { id: "duels", label: "Battles" },
];
export type Page = Route["page"];
/**
 * The seven tabs of the bottom bar, as on the web phone. Each holds pages of its own; the account also holds the
 * community, tournaments and matches.
 */
export type Tab = "timer" | "algorithms" | "learn" | "train" | "duel" | "coaching" | "profile";
export const TABS: readonly Tab[] = ["timer", "algorithms", "learn", "train", "duel", "coaching", "profile"];
const TAB_OF: Record<Page, Tab> = {
  playground: "timer", algorithms: "algorithms", learn: "learn", assisted: "learn", training: "train", duel: "duel", coaching: "coaching",
  profile: "profile", community: "profile", tournaments: "profile", match: "profile",
};
export const tabOf = (page: Page): Tab => TAB_OF[page];
/** The page a tab opens on the first time, and goes back to when its button is tapped again. */
export const TAB_ROOT: Record<Tab, Route> = {
  timer: { page: "playground" }, algorithms: { page: "algorithms" }, learn: { page: "learn" }, train: { page: "training" },
  duel: { page: "duel" }, coaching: { page: "coaching" }, profile: { page: "profile" },
};
/** How deep a route sits in its tab: its first page is 0, a page opened from it 1. */
export function routeDepth(route: Route) {
  switch (route.page) {
    case "learn": return route.method ? 1 : 0;
    case "assisted": return 2;
    case "community": case "tournaments": return route.view ? 2 : 1;
    case "match": return 3;
    // A section is the tab's own level; what it opens (a coach, a conversation, a call) goes one deeper.
    case "coaching": return route.view?.includes("/") ? 1 : 0;
    default: return 0;
  }
}
/**
 * A web address of the app (a link, a notification's "/community/messages/4") as a route of this app, with the puzzle
 * it names; null for an address the app has no page for.
 */
export function routeOfUrl(url: string): { route: Route; puzzle?: PuzzleId } | null {
  const [path = "", search = ""] = url.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "").split("#")[0]!.split("?");
  const r = readRoute(path, search);
  if (!r) return null;
  const route: Route | null =
    r.page === "playground" || r.page === "training" || r.page === "duel" ? { page: r.page }
    : r.page === "algorithms" ? (r.caseId ? { page: "algorithms", caseId: r.caseId } : { page: "algorithms" })
    : r.page === "learn" ? (r.learnMethod ? { page: "learn", method: r.learnMethod } : { page: "learn" })
    : r.page === "profile" ? (PROFILE_SECTIONS.some(s => s.id === r.profileMode && s.id !== "overview") ? { page: "profile", mode: r.profileMode as ProfileMode } : { page: "profile" })
    : r.page === "community" || r.page === "tournaments" ? (r.view ? { page: r.page, view: r.view } : { page: r.page })
    : r.page === "match" ? { page: "match", id: Number(r.view!.split("/")[0]) }
    : r.page === "coaching" ? (r.coaching ? { page: "coaching", view: r.coaching } : { page: "coaching" })
    : null;
  return route && { route, ...(r.puzzle ? { puzzle: r.puzzle } : {}) };
}
/** The web address of a route, as `routeOfUrl` reads it back. */
export function urlOfRoute(route: Route) {
  switch (route.page) {
    case "algorithms": return pageUrl("algorithms", { caseId: route.caseId });
    case "learn": return pageUrl("learn", { learnMethod: route.method });
    case "assisted": return pageUrl("learn");
    case "profile": return pageUrl("profile", { profileMode: route.mode ?? "overview" });
    case "community": case "tournaments": return pageUrl(route.page, { view: route.view });
    case "match": return pageUrl("match", { view: String(route.id) });
    case "coaching": return pageUrl("coaching", { coaching: route.view });
    default: return pageUrl(route.page);
  }
}
/** The guide shown by the guides dialog (App.tsx), `null` while it is closed. Settings opens it on "about". */
export const guidesAtom = atom<GuideId | null>(null);
/** Whether the notation guide is open in a sheet of its own (from Learn and the account menu). */
export const notationAtom = atom(false);

const LAST_TAB_KEY = "cubix.ui.lastTab";
function initialRoute(): Route {
  try {
    const saved = JSON.parse(storage.getItem(LAST_TAB_KEY) ?? "null");
    if (saved && ["playground", "learn", "algorithms", "training", "duel", "coaching", "profile"].includes(saved.page)) return { page: saved.page };
  } catch { /* Open the default tab. */ }
  return { page: "playground" };
}
const historyAtom = atom<Route[]>([initialRoute()]);
/** How the current route was reached, so page transitions can slide forward on a push and back on a pop. */
export type NavigationKind = "push" | "replace" | "pop";
const navigationKindAtom = atom<NavigationKind>("push");
export const lastNavigationAtom = atom(get => get(navigationKindAtom));
export const routeAtom = atom(get => get(historyAtom).at(-1)!, (get, set, route: Route) => {
  const current = get(historyAtom).at(-1)!;
  if (JSON.stringify(current) === JSON.stringify(route)) return;
  set(historyAtom, [...get(historyAtom), route].slice(-60));
  set(navigationKindAtom, "push");
  try { storage.setItem(LAST_TAB_KEY, JSON.stringify({ page: route.page })); } catch { /* Navigation must still work without storage. */ }
});
/** Change the current view without adding a step to the hardware back history. */
export const replaceRouteAtom = atom(null, (get, set, route: Route) => {
  set(historyAtom, [...get(historyAtom).slice(0, -1), route]);
  set(navigationKindAtom, "replace");
  try { storage.setItem(LAST_TAB_KEY, JSON.stringify({ page: route.page })); } catch { /* Best effort. */ }
});
/** Pop one entry; returns false when there is nothing to go back to. */
export const goBackAtom = atom(null, (get, set) => {
  const history = get(historyAtom);
  if (history.length <= 1) return false;
  set(historyAtom, history.slice(0, -1));
  set(navigationKindAtom, "pop");
  try { storage.setItem(LAST_TAB_KEY, JSON.stringify({ page: history.at(-2)!.page })); } catch { /* Best effort. */ }
  return true;
});
/** The route a back step would return to, so detail views can pop instead of pushing their parent. */
export const previousRouteAtom = atom(get => get(historyAtom).at(-2) ?? null);
/**
 * A tab button: another tab opens on the page it showed last (its root the first time); the current tab goes back to
 * its root, dropping the pages opened in it from the history.
 */
export const openTabAtom = atom(null, (get, set, tab: Tab) => {
  const history = get(historyAtom), current = history.at(-1)!;
  if (tabOf(current.page) !== tab) {
    const last = [...history].reverse().find(route => tabOf(route.page) === tab);
    // Training opened on a selection starts once: coming back to the tab does not start it again.
    set(routeAtom, last && !(last.page === "training" && last.autostart) ? last : TAB_ROOT[tab]);
    return;
  }
  // Training keeps its steps (setup, a way to practise, the session) in state rather than in routes.
  if (current.page === "training") { set(trainingStepAtom, "setup"); set(trainingSetupModeAtom, ""); }
  const root = TAB_ROOT[tab];
  if (JSON.stringify(current) === JSON.stringify(root)) return;
  let kept = history.length;
  while (kept > 1 && history[kept - 1]!.page === current.page && JSON.stringify(history[kept - 1]) !== JSON.stringify(root)) kept--;
  const trimmed = history.slice(0, kept);
  set(historyAtom, JSON.stringify(trimmed.at(-1)) === JSON.stringify(root) ? trimmed : [...trimmed, root]);
  set(navigationKindAtom, "pop");
  try { storage.setItem(LAST_TAB_KEY, JSON.stringify({ page: root.page })); } catch { /* Best effort. */ }
});
/**
 * The profile's own puzzle and solve filters: they browse other puzzles without touching the rest of the app,
 * and are shared by the overview and its detail pages. Unset values follow the app; leaving the profile clears them.
 */
export const profileFiltersAtom = atom<{ cube?: PuzzleId; solveMode?: SolveMode; scrambleType?: ScrambleType }>({});

// ---------------------------------------------------------------------------
// Persisted preferences (synchronous MMKV storage, read on init)
// ---------------------------------------------------------------------------
const json = createJSONStorage<any>(() => storage);
const persisted = <T>(key: string, fallback: T) => atomWithStorage<T>(key, fallback, json, { getOnInit: true });

const storedPuzzleAtom = persisted<PuzzleId>("cubix.puzzle", "333");
export const cubeSwitchLockedAtom = atom(false);
export const puzzleAtom = atom(get => { const value = get(storedPuzzleAtom); return isPuzzle(value) ? value : "333"; }, (get, set, puzzle: PuzzleId) => {
  if (!isPuzzle(puzzle) || get(cubeSwitchLockedAtom)) return;
  set(storedPuzzleAtom, puzzle);
  const route = get(routeAtom);
  if (route.page === "algorithms" && route.caseId) set(routeAtom, { page: "algorithms" });
  // A course belongs to its puzzle: another puzzle opens on its own methods.
  if (route.page === "learn" && route.method) set(replaceRouteAtom, { page: "learn" });
  set(learnMethodAtom, undefined);
  if (route.page === "profile" && route.caseId) set(routeAtom, { ...route, caseId: undefined });
});
/** Each puzzle remembers its own stage, set, training selection and scramble. */
function perPuzzleAtom<T>(key: string, fallback: T) {
  const values = persisted<Record<string, T>>(key, {});
  const read = (all: Record<string, T>, puzzle: PuzzleId) => all[puzzle] ?? all[String(puzzleInfo(puzzle).cubeSize)] ?? fallback;
  return atom(get => read(get(values), get(puzzleAtom)), (get, set, update: T | ((value: T) => T)) => {
    const puzzle = get(puzzleAtom), previous = read(get(values), puzzle);
    set(values, { ...get(values), [puzzle]: typeof update === "function" ? (update as (value: T) => T)(previous) : update });
  });
}
const preferredStageAtom = perPuzzleAtom<Stage | null>("cubix.algs.stageByCube", null);
export const stageAtom = atom(get => {
  const available = catalogSets.filter(s => puzzleOf(s) === get(puzzleAtom));
  const preferred = get(preferredStageAtom);
  return preferred !== null && available.some(s => s.stage === preferred) ? preferred : available[0]?.stage ?? "F2L";
}, (_get, set, value: Stage) => set(preferredStageAtom, value));
export const setByStageAtom = perPuzzleAtom<Partial<Record<Stage, string>>>("cubix.algs.setByCube", { F2L: "f2l", OLL: "oll", PLL: "pll" });
export const learningFilterAtom = persisted<"all" | "learned" | "not-learned">("cubix.algs.learningFilter", "all");
export const collapsedAlgorithmGroupsAtom = persisted<Record<string, boolean>>("cubix.algs.collapsedGroups", {});

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
// The catalogue ships with the app and personal statistics are computed from the local workspace, so
// every data atom is synchronous: no screen ever suspends or shows a loader after boot.
export const casesAtom = atom<CaseDto[]>(get => local.read.catalog(get(puzzleAtom)).cases);
export const setsAtom = atom(get => local.read.catalog(get(puzzleAtom)).sets);
/** bump to refetch stats */
export const statsVersionAtom = atom(0);
/** Case IDs are unique across puzzles and sets; learning is independent of timed solves.
 * Marks live in the local-first workspace, so they sync across devices; writing toggles one case. */
export const learnedCaseIdsAtom = atom(get => { get(statsVersionAtom); return local.learned(); }, (_get, _set, caseId: string) => {
  void api.setLearned(caseId, !local.learned().includes(caseId)).catch(() => { /* Reported by the sync indicator. */ });
});
/** Last deleted solve, so the open lists update without refetching every timer tick. */
export const deletedSolveIdAtom = atom<number | null>(null);
/** The latest penalty or comment edit; practice pages patch their session list from it. */
export const updatedSolveAtom = atom<SolveDto | null>(null);
export const statsAtom = atom(get => {
  get(statsVersionAtom);
  const list = local.read.stats(get(puzzleAtom), { solveMode: get(solveModeAtom) });
  return new Map<string, CaseStatsDto>(list.map(s => [s.caseId, s]));
});

// ---------------------------------------------------------------------------
// Training preferences
// ---------------------------------------------------------------------------
export const selectedCaseIdsAtom = perPuzzleAtom<string[]>("cubix.training.selectionByCube", []);
/** The stages Review draws from, per puzzle (as on the web); none picked reviews every stage. */
export const reviewStagesAtom = perPuzzleAtom<string[]>("cubix.training.reviewStages", []);
export const randomAufAtom = persisted<boolean>("cubix.training.randomAuf", true);
/** Selected cases still to learn, as the training page last saw them for a puzzle. Kept outside the
 * page so marking the last one learned from its details and coming back still celebrates. */
export const learningGoalAtom = atom<{ puzzle: PuzzleId; pending: string[] } | null>(null);
/** Cases of the catalogue, or first-block scrambles (cross and one pair) on the 3×3; shared with the web prefs. */
type TrainingKind = "cases" | "cross1";
const storedTrainingKindAtom = persisted<TrainingKind>("cubix.training.kind", "cases");
export const trainingKindAtom = atom(get => get(storedTrainingKindAtom) === "cross1" ? "cross1" as const : "cases" as const,
  (_get, set, kind: TrainingKind) => set(storedTrainingKindAtom, kind));
const storedCrossMovesAtom = persisted<number>("cubix.training.crossMoves", 4);
export const crossMovesAtom = atom(get => { const moves = get(storedCrossMovesAtom); return [3, 4, 5].includes(moves) ? moves : 4; },
  (_get, set, moves: number) => { if ([3, 4, 5].includes(moves)) set(storedCrossMovesAtom, moves); });
/** Training opens on the choice of what to practise, then shows the timer for it (kept while switching tabs). */
export const trainingStepAtom = atom<"setup" | "practice">("setup");
/** Mode highlighted on the setup screen before it starts; empty = the one trained last. */
export const trainingSetupModeAtom = atom("");

export type { ThemeId } from "../../src/client/lib/theme";
export const themeAtom = persisted<ThemeId>("cubix.ui.theme", DEFAULT_THEME);
/** Dark, light, or whichever the system asks for; anything else stored reads as dark. */
export type ColorMode = "dark" | "light" | "system";
const storedColorModeAtom = persisted<ColorMode>("cubix.ui.colorMode", "dark");
export const colorModeAtom = atom(get => { const mode = get(storedColorModeAtom); return mode === "light" || mode === "system" ? mode : "dark"; },
  (_get, set, mode: ColorMode) => set(storedColorModeAtom, mode));

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------
const preferredSolveModeAtom = perPuzzleAtom<SolveMode>("cubix.practice.modeByPuzzle", "standard");
/** One-handed and blindfolded are WCA events of their own: only the puzzles that have them keep such a mode. */
export const solveModeAtom = atom(get => { const mode = get(preferredSolveModeAtom); return eventOf(get(puzzleAtom), mode) ? mode : "standard"; });
/** The WCA event practised, chosen in the puzzle picker: its puzzle and its solve mode. */
export const eventAtom = atom<EventId, [EventId], void>(get => eventOf(get(puzzleAtom), get(solveModeAtom))?.id ?? get(puzzleAtom), (get, set, id) => {
  const event = eventInfo(id);
  if (!event || get(cubeSwitchLockedAtom)) return;
  set(puzzleAtom, event.puzzle);
  set(preferredSolveModeAtom, event.solveMode);
});
const preferredScrambleTypeAtom = perPuzzleAtom<ScrambleType>("cubix.practice.typeByPuzzle", "normal");
export const scrambleTypeAtom = atom(get => {
  const info = puzzleInfo(get(puzzleAtom)), preferred = get(preferredScrambleTypeAtom);
  return info.scrambles.includes(preferred) ? preferred : info.scrambles[0];
}, (get, set, type: ScrambleType) => {
  if (!get(cubeSwitchLockedAtom) && puzzleInfo(get(puzzleAtom)).scrambles.includes(type)) set(preferredScrambleTypeAtom, type);
});
/** Timer page only: run the timer, type a time from an external timer, or time without recording. */
export const timeEntryAtom = persisted<TimeEntry>("cubix.timer.entry", "timer");
export const practiceContextAtom = atom(get => ({ puzzle: get(puzzleAtom), solveMode: get(solveModeAtom), scrambleType: get(scrambleTypeAtom) }));
const scramblesAtom = persisted<Record<string, string>>("cubix.playground.scrambleByContext", {});
export const playgroundScrambleAtom = atom(get => {
  const c = get(practiceContextAtom);
  return get(scramblesAtom)[`${c.puzzle}:${c.solveMode}:${c.scrambleType}`] ?? "";
}, (get, set, value: string) => {
  const c = get(practiceContextAtom);
  set(scramblesAtom, { ...get(scramblesAtom), [`${c.puzzle}:${c.solveMode}:${c.scrambleType}`]: value });
});
/** Cross + 1 training: timer solves of its own scramble type (`cross1-N`) on the 3×3. */
export const crossContextAtom = atom(get => ({ puzzle: "333" as PuzzleId, solveMode: get(solveModeAtom), scrambleType: `cross1-${get(crossMovesAtom)}` as ScrambleType }));
/** Its scramble, kept per context beside the timer's own ones, like the web. */
export const crossScrambleAtom = atom(get => {
  const c = get(crossContextAtom);
  return get(scramblesAtom)[`${c.puzzle}:${c.solveMode}:${c.scrambleType}`] ?? "";
}, (get, set, { context: c, scramble }: { context: { puzzle: PuzzleId; solveMode: SolveMode; scrambleType: ScrambleType }; scramble: string }) => {
  // The context travels with the scramble: a generation that ends after a change of moves keeps its own.
  set(scramblesAtom, { ...get(scramblesAtom), [`${c.puzzle}:${c.solveMode}:${c.scrambleType}`]: scramble });
});

// ---------------------------------------------------------------------------
// Learn
// ---------------------------------------------------------------------------
/** The course the Learn tab shows while the app runs, so leaving the tab and coming back finds it again. */
export const learnMethodAtom = atom<string | undefined>(undefined);
const courseVersionAtom = atom(0);
/** The account's progress in the Learn section, a device preference beside its learning plan (as on the web). */
export const courseProgressAtom = atom(get => {
  get(courseVersionAtom);
  try { return readCourseProgress(JSON.parse(storage.getItem(courseStorageKey(get(userAtom)?.id ?? "guest")) ?? "null")); }
  catch { return EMPTY_COURSE_PROGRESS; }
}, (get, set, next: CourseProgress) => {
  storage.setItem(courseStorageKey(get(userAtom)?.id ?? "guest"), JSON.stringify(next));
  set(courseVersionAtom, v => v + 1);
});

/** Read synchronously from the local workspace, so the shell never waits for an account. */
export const userAtom = atom<UserDto | null>(local.current());
/** Whether this device holds the account's session token; a sign-out or an expired session (401) clears it. */
export const hasTokenAtom = atom(!!authToken.get());
/** The app is only used signed in: an account and its token, or the sign-in screen. */
export const signedInAtom = atom(get => { const user = get(userAtom); return !!user && !user.isGuest && get(hasTokenAtom); });
/** The settings sheet (the account's "…" menu). */
export const settingsOpenAtom = atom(false);
/** Transient UI focus state; never persisted with user preferences. */
export const timerRunningAtom = atom(false);
/** The Android keyboard covers the floating navigation; reclaim that space in forms. */
export const keyboardVisibleAtom = atom(false);
