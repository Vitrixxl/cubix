import { DEFAULT_THEME, type ThemeId } from "../../src/client/lib/theme";
import { BLD_PREFS, type OwnAlgs } from "../../src/client/lib/bld";
import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { eventInfo, eventOf, isPuzzle, puzzleInfo, type EventId, type PuzzleId, type ScrambleType, type SolveMode, scrambleTypesOf } from "../../src/shared/puzzles";
import type { CaseDto, CaseStatsDto, SolveDto, UserDto } from "../../src/shared/types";
import type { TimeEntry } from "../../src/client/lib/format";
import { EMPTY_COURSE_PROGRESS, courseStorageKey, readCourseProgress, type CourseProgress } from "../../src/client/lib/course";
import { pageUrl, readRoute } from "../../src/client/lib/route";
import { api, authToken, local } from "./api";
import { REMINDERS_KEY } from "../../src/client/lib/reminders";
import { storage } from "./platform/storage";
import { CROSS_MOVES, crossMovesFor, crossScrambleType, crossSolveMode, isCrossTarget, type CrossTarget } from "../../src/shared/crossTraining";

// ---------------------------------------------------------------------------
// Routing: one atom plus a bounded history so the Android back button behaves like the browser.
// ---------------------------------------------------------------------------
export type GuideId = "about" | "algorithms" | "training" | "timer" | "smartCube" | "duel" | "community" | "coaching" | "methods" | "notation" | "averages";
export type Route =
  | { page: "learn"; method?: string }
  /** The catalogue; `set` opens a set, `search` the search over every case, `caseId` a case (`caseIds`: its neighbours). */
  | { page: "algorithms"; caseId?: string; caseIds?: string[]; set?: string; search?: boolean }
  | { page: "training"; autostart?: boolean }
  | { page: "playground" }
  /** The smart cube solves' analysis (the timer section's second page). */
  | { page: "analysis" }
  /** A solve on its own, pushed from a list of times: its replay, and (`step`) the analysis of one of its steps. */
  | { page: "solve"; id: number; step?: string; comment?: boolean }
  | { page: "duel" }
  /** The daily scramble; `day` (YYYY-MM-DD) opens a past day, "results" the player's results (DailyPage). */
  | { page: "daily"; day?: string }
  /** The settings, pushed from the profile. */
  | { page: "settings" }
  | { page: "profile"; mode?: ProfileMode; caseId?: string; group?: string }
  /** The assisted solve of a 3×3 course (AssistedPage), over the course: `method` its id. */
  | { page: "assisted"; method: string }
  /**
   * The community (messages, friends, groups) and tournaments, opened from the account page or a link; `view` is the
   * address under the page, as on the web ("messages/4", "groups/2", "add/<username>", a tournament's id).
   */
  | { page: "community"; view?: string }
  | { page: "tournaments"; view?: string }
  /** The WCA's rankings, records, competitions and people; `view` as on the web ("records", "persons/<WCA ID>"). */
  | { page: "wca"; view?: string }
  /** A battle or a tournament match, live. */
  | { page: "match"; id: number }
  /** Coaching: its section and argument, as on the web ("dashboard", "coach/<id>", "messages/<id>", "call/<id>"); none opens the account's default. */
  | { page: "coaching"; view?: string };
/** A profile detail view; no mode shows the overview tiles. */
export type ProfileMode = "playground" | "training" | "achievements" | "duels" | "activity";
/** The account's sections, as its tabs show them. */
export const PROFILE_SECTIONS: { id: ProfileMode | "overview"; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "playground", label: "Timer" }, { id: "training", label: "Training" },
  { id: "achievements", label: "Awards" }, { id: "duels", label: "Battles" },
];
export type Page = Route["page"];
/**
 * The five sections of the bottom bar: the timer (and the analysis), learning (courses, training), the algorithms, the
 * social side (the chat with friends and groups, coaching, the challenges: duel, tournaments, daily) and the player's
 * profile.
 */
export type Tab = "timer" | "learn" | "algorithms" | "social" | "me";
export const TABS: readonly Tab[] = ["timer", "learn", "algorithms", "social", "me"];
const TAB_OF: Record<Page, Tab> = {
  playground: "timer", analysis: "timer", solve: "timer", learn: "learn", assisted: "learn", training: "learn", algorithms: "algorithms",
  duel: "social", tournaments: "social", match: "social", daily: "social", wca: "social", community: "social", coaching: "social",
  profile: "me", settings: "me",
};
export const tabOf = (page: Page): Tab => TAB_OF[page];
/** The page a section opens on the first time, and goes back to when its button is tapped again. */
export const TAB_ROOT: Record<Tab, Route> = {
  timer: { page: "playground" }, learn: { page: "learn" }, algorithms: { page: "algorithms" }, social: { page: "community" }, me: { page: "profile" },
};
/**
 * A page of a section, as its tab under the app bar shows it: its name, where it leads, and whether a route is in it;
 * pages of one `group` share a tab, and switch under it.
 */
export type SectionPage = { id: string; label: string; group?: string; route: Route; has: (route: Route) => boolean };
const isPeople = (route: Route) => route.page === "community" && !!route.view?.startsWith("people");
export const SECTION_PAGES: Record<Tab, SectionPage[]> = {
  timer: [
    { id: "playground", label: "Timer", route: { page: "playground" }, has: r => r.page === "playground" },
    { id: "analysis", label: "Analysis", route: { page: "analysis" }, has: r => r.page === "analysis" },
  ],
  learn: [
    { id: "learn", label: "Courses", route: { page: "learn" }, has: r => r.page === "learn" || r.page === "assisted" },
    { id: "training", label: "Training", route: { page: "training" }, has: r => r.page === "training" },
  ],
  algorithms: [{ id: "algorithms", label: "Algorithms", route: { page: "algorithms" }, has: r => r.page === "algorithms" }],
  social: [
    { id: "messages", group: "Messages", label: "Messages", route: { page: "community" }, has: r => r.page === "community" && !isPeople(r) },
    { id: "people", group: "Messages", label: "Community", route: { page: "community", view: "people" }, has: isPeople },
    { id: "coaching", label: "Coaching", route: { page: "coaching" }, has: r => r.page === "coaching" },
    { id: "duel", group: "Challenges", label: "Duel", route: { page: "duel" }, has: r => r.page === "duel" },
    { id: "tournaments", group: "Challenges", label: "Tournaments", route: { page: "tournaments" }, has: r => r.page === "tournaments" || r.page === "match" },
    { id: "daily", group: "Challenges", label: "Daily", route: { page: "daily" }, has: r => r.page === "daily" },
    { id: "wca", group: "Challenges", label: "WCA", route: { page: "wca" }, has: r => r.page === "wca" },
  ],
  me: [{ id: "profile", label: "Profile", route: { page: "profile" }, has: r => r.page === "profile" || r.page === "settings" }],
};
/** How deep a route sits in its tab: its first page is 0, a page opened from it 1. */
export function routeDepth(route: Route) {
  switch (route.page) {
    case "learn": return route.method ? 1 : 0;
    // The profile's modes (statistics, cases, achievements, battles, activity) are screens pushed over it.
    case "profile": return route.mode ? 1 : 0;
    case "algorithms": return route.caseId ? 2 : route.set || route.search ? 1 : 0;
    case "assisted": return 2;
    case "settings": return 1;
    case "solve": return route.step ? 2 : 1;
    case "daily": return route.day ? 1 : 0;
    case "community": return route.view && route.view !== "people" ? 1 : 0;
    case "tournaments": return route.view ? 1 : 0;
    case "wca": return route.view?.includes("/") ? 1 : 0;
    case "match": return 2;
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
    r.page === "playground" || r.page === "training" || r.page === "duel" || r.page === "daily" ? { page: r.page }
    : r.page === "profile" && r.profileMode === "analysis" ? { page: "analysis" }
    : r.page === "algorithms" ? (r.caseId ? { page: "algorithms", caseId: r.caseId } : { page: "algorithms" })
    : r.page === "learn" ? (r.learnMethod ? { page: "learn", method: r.learnMethod } : { page: "learn" })
    : r.page === "profile" ? (PROFILE_SECTIONS.some(s => s.id === r.profileMode && s.id !== "overview") ? { page: "profile", mode: r.profileMode as ProfileMode } : { page: "profile" })
    : r.page === "community" || r.page === "tournaments" || r.page === "wca" ? (r.view ? { page: r.page, view: r.view } : { page: r.page })
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
    case "assisted": return pageUrl("learn", { learnMethod: route.method });
    case "analysis": return pageUrl("profile", { profileMode: "analysis" });
    case "solve": return pageUrl("playground");
    case "settings": return pageUrl("profile");
    case "profile": return pageUrl("profile", { profileMode: route.mode ?? "overview" });
    case "community": case "tournaments": case "wca": return pageUrl(route.page, { view: route.view });
    case "match": return pageUrl("match", { view: String(route.id) });
    case "coaching": return pageUrl("coaching", { coaching: route.view });
    default: return pageUrl(route.page);
  }
}
/** The guide shown by the guides dialog (App.tsx), `null` while it is closed. Settings opens it on "about". */
export const guidesAtom = atom<GuideId | null>(null);
/** Whether the notation guide is open in a sheet of its own (from Learn and the settings). */
export const notationAtom = atom(false);

const LAST_TAB_KEY = "cubix.ui.lastTab";
function initialRoute(): Route {
  try {
    const saved = JSON.parse(storage.getItem(LAST_TAB_KEY) ?? "null");
    if (saved && ["playground", "analysis", "learn", "algorithms", "training", "duel", "daily", "tournaments", "wca", "coaching", "profile"].includes(saved.page)) return { page: saved.page };
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
    set(routeAtom, !last ? TAB_ROOT[tab] : last.page === "training" && last.autostart ? { page: "training" } : last);
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
export const persisted = <T>(key: string, fallback: T) => atomWithStorage<T>(key, fallback, json, { getOnInit: true });

const storedPuzzleAtom = persisted<PuzzleId>("cubix.puzzle", "333");
export const cubeSwitchLockedAtom = atom(false);
export const puzzleAtom = atom(get => { const value = get(storedPuzzleAtom); return isPuzzle(value) ? value : "333"; }, (get, set, puzzle: PuzzleId) => {
  if (!isPuzzle(puzzle) || get(cubeSwitchLockedAtom)) return;
  set(storedPuzzleAtom, puzzle);
  const route = get(routeAtom);
  if (route.page === "algorithms" && (route.caseId || route.set)) set(routeAtom, { page: "algorithms" });
  // A course belongs to its puzzle: another puzzle opens on its own methods.
  if (route.page === "learn" && route.method) set(replaceRouteAtom, { page: "learn" });
  set(learnMethodAtom, undefined);
  if (route.page === "profile" && route.caseId) set(routeAtom, { ...route, caseId: undefined });
});
/** Each puzzle remembers its own stage, set, training selection and scramble. */
export function perPuzzleAtom<T>(key: string, fallback: T) {
  const values = persisted<Record<string, T>>(key, {});
  const read = (all: Record<string, T>, puzzle: PuzzleId) => all[puzzle] ?? all[String(puzzleInfo(puzzle).cubeSize)] ?? fallback;
  return atom(get => read(get(values), get(puzzleAtom)), (get, set, update: T | ((value: T) => T)) => {
    const puzzle = get(puzzleAtom), previous = read(get(values), puzzle);
    set(values, { ...get(values), [puzzle]: typeof update === "function" ? (update as (value: T) => T)(previous) : update });
  });
}
export const learningFilterAtom = persisted<"all" | "learned" | "not-learned">("cubix.algs.learningFilter", "all");
/** Whether a last layer case shows its algorithms for the left hand (`leftHandAlgs`), as on the web. */
export const leftHandAtom = persisted<boolean>("cubix.algs.leftHand", false);

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
export const randomAufAtom = persisted<boolean>("cubix.training.randomAuf", true);
/** Whether the app reminds of the day's review and of a streak at stake (`lib/reminders`). */
export const remindersAtom = persisted<boolean>(REMINDERS_KEY, true);
/** Selected cases still to learn, as the training page last saw them for a puzzle. Kept outside the
 * page so marking the last one learned from its details and coming back still celebrates. */
export const learningGoalAtom = atom<{ puzzle: PuzzleId; pending: string[] } | null>(null);
// The training kind the web shares ("cross1", the former first-block training, maps to the XCross).
const storedTrainingKindAtom = persisted<string>("cubix.training.kind", "cases");
const storedCrossTargetAtom = persisted<string>("cubix.training.crossTarget", "");
const storedCrossMovesAtom = persisted<number>("cubix.training.crossMoves", 5);
export const crossTargetAtom = atom<CrossTarget, [CrossTarget], void>(get => {
  const target = get(storedCrossTargetAtom);
  return isCrossTarget(target) ? target : get(storedTrainingKindAtom) === "cross1" ? "xcross" : "cross";
}, (get, set, target) => {
  set(storedCrossMovesAtom, crossMovesFor(target, get(storedCrossMovesAtom)));
  set(storedCrossTargetAtom, target);
});
export const crossMovesAtom = atom(get => crossMovesFor(get(crossTargetAtom), get(storedCrossMovesAtom)),
  (get, set, moves: number) => { if (CROSS_MOVES[get(crossTargetAtom)].includes(moves)) set(storedCrossMovesAtom, moves); });
/** Training opens on the choice of what to practise, then shows the timer for it (kept while switching tabs). */
export const trainingStepAtom = atom<"setup" | "practice">("setup");
/** What the training started drills: the learned cases' pool, free practice, cross scrambles, a recognition run or the blindfolded training. */
export type TrainingRun = "cases" | "review" | "free" | "cross" | "recognition" | "bld";
export const trainingRunAtom = atom<TrainingRun>("cases");
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
  // Fewest Moves and Multi-Blind keep to WCA scrambles, whatever the puzzle's other events use.
  const types = scrambleTypesOf(get(puzzleAtom), get(solveModeAtom)), preferred = get(preferredScrambleTypeAtom);
  return types.includes(preferred) ? preferred : types[0]!;
}, (get, set, type: ScrambleType) => {
  if (!get(cubeSwitchLockedAtom) && scrambleTypesOf(get(puzzleAtom), get(solveModeAtom)).includes(type)) set(preferredScrambleTypeAtom, type);
});
/** A metronome's beats per minute while a solve runs, 0 when off (src/client/lib/metronome). */
export const metronomeAtom = persisted<number>("cubix.timer.metronome", 0);
/** Multi-Blind: the cubes of an attempt. */
export const mbldCubesAtom = persisted<number>("cubix.timer.mbldCubes", 3);
/** Timer page only: run the timer, type a time from an external timer, or time without recording. */
export const timeEntryAtom = persisted<TimeEntry>("cubix.timer.entry", "timer");
/** The phases a timer solve is timed in (src/client/lib/phases), as the web's `cubix.timer.phases`. */
export const phasesAtom = persisted<string>("cubix.timer.phases", "off");
export const practiceContextAtom = atom(get => ({ puzzle: get(puzzleAtom), solveMode: get(solveModeAtom), scrambleType: get(scrambleTypeAtom) }));
const scramblesAtom = persisted<Record<string, string>>("cubix.playground.scrambleByContext", {});
export const playgroundScrambleAtom = atom(get => {
  const c = get(practiceContextAtom);
  return get(scramblesAtom)[`${c.puzzle}:${c.solveMode}:${c.scrambleType}`] ?? "";
}, (get, set, value: string) => {
  const c = get(practiceContextAtom);
  set(scramblesAtom, { ...get(scramblesAtom), [`${c.puzzle}:${c.solveMode}:${c.scrambleType}`]: value });
});
/** Cross training: timer solves of its own scramble type (`xcross-6`…) on the 3×3. */
export const crossContextAtom = atom(get => ({ puzzle: "333" as PuzzleId, solveMode: crossSolveMode(get(solveModeAtom)), scrambleType: crossScrambleType(get(crossTargetAtom), get(crossMovesAtom)) as ScrambleType }));
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
/** The app used without an account, on this device only ("Continue without an account"); signing in clears it. */
/** Each letter pair's word, for the training list's count too. */
export const bldWordsAtom = persisted<Record<string, string>>(BLD_PREFS.words, {});
/**
 * The algorithms a player wrote for a case ("Add yours", a commutator's own), and those of them used. Kept on this
 * device: the account only records the catalogue's algorithms.
 */
export const ownAlgsAtom = persisted<OwnAlgs>(BLD_PREFS.own, {});
export const guestModeAtom = persisted<boolean>("cubix.guestMode", false);
/** Transient UI focus state; never persisted with user preferences. */
export const timerRunningAtom = atom(false);
/** The Android keyboard covers the floating navigation; reclaim that space in forms. */
export const keyboardVisibleAtom = atom(false);
