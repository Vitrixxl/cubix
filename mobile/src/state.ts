import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { isPuzzle, puzzleInfo, puzzleOf, SOLVE_MODES, type PuzzleId, type ScrambleType, type SolveMode } from "../../src/shared/puzzles";
import type { CaseDto, CaseStatsDto, Stage, UserDto } from "../../src/shared/types";
import { sets as catalogSets } from "../../src/client/local/catalog";
import { api, local } from "./api";
import { storage } from "./platform/storage";

// ---------------------------------------------------------------------------
// Routing: one atom plus a bounded history so the Android back button behaves like the browser.
// ---------------------------------------------------------------------------
export type GuideId = "about" | "timer" | "algorithms" | "training" | "averages";
export type Route =
  | { page: "guides"; guide?: GuideId }
  | { page: "algorithms"; caseId?: string }
  | { page: "training"; autostart?: boolean }
  | { page: "playground" }
  | { page: "profile"; mode?: ProfileMode; caseId?: string };
export type ProfileMode = "playground" | "training" | "achievements";
export type Page = Route["page"];

const LAST_TAB_KEY = "cubix.ui.lastTab";
function initialRoute(): Route {
  try {
    const saved = JSON.parse(storage.getItem(LAST_TAB_KEY) ?? "null");
    if (saved && ["playground", "algorithms", "training", "profile"].includes(saved.page)) return { page: saved.page };
  } catch { /* Open the default tab. */ }
  return { page: "playground" };
}
const historyAtom = atom<Route[]>([initialRoute()]);
export const routeAtom = atom(get => get(historyAtom).at(-1)!, (get, set, route: Route) => {
  const current = get(historyAtom).at(-1)!;
  if (JSON.stringify(current) === JSON.stringify(route)) return;
  set(historyAtom, [...get(historyAtom), route].slice(-60));
  try { storage.setItem(LAST_TAB_KEY, JSON.stringify({ page: route.page })); } catch { /* Navigation must still work without storage. */ }
});
/** Pop one entry; returns false when there is nothing to go back to. */
export const goBackAtom = atom(null, (get, set) => {
  const history = get(historyAtom);
  if (history.length <= 1) return false;
  set(historyAtom, history.slice(0, -1));
  try { storage.setItem(LAST_TAB_KEY, JSON.stringify({ page: history.at(-2)!.page })); } catch { /* Best effort. */ }
  return true;
});
export const canGoBackAtom = atom(get => get(historyAtom).length > 1);

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
export const casesAtom = atom<Promise<CaseDto[]>>(async get => api.cases(get(puzzleAtom)));
export const setsAtom = atom(async get => api.sets(get(puzzleAtom)));
/** bump to refetch stats */
export const statsVersionAtom = atom(0);
/** Case IDs are unique across puzzles and sets; learning is independent of timed solves.
 * Marks live in the local-first workspace, so they sync across devices; writing toggles one case. */
export const learnedCaseIdsAtom = atom(get => { get(statsVersionAtom); return local.learned(); }, (_get, _set, caseId: string) => {
  void api.setLearned(caseId, !local.learned().includes(caseId)).catch(() => { /* Reported by the sync indicator. */ });
});
/** Last deleted solve, so the open lists update without refetching every timer tick. */
export const deletedSolveIdAtom = atom<number | null>(null);
export const statsAtom = atom(async get => {
  get(statsVersionAtom);
  const list = await api.stats(get(puzzleAtom), { solveMode: get(solveModeAtom) });
  return new Map<string, CaseStatsDto>(list.map(s => [s.caseId, s]));
});

// ---------------------------------------------------------------------------
// Training preferences
// ---------------------------------------------------------------------------
export const selectedCaseIdsAtom = perPuzzleAtom<string[]>("cubix.training.selectionByCube", []);
export const randomAufAtom = persisted<boolean>("cubix.training.randomAuf", true);
/** Selected cases still to learn, as the training page last saw them for a puzzle. Kept outside the
 * page so marking the last one learned from its details and coming back still celebrates. */
export const learningGoalAtom = atom<{ puzzle: PuzzleId; pending: string[] } | null>(null);

export type ThemeId = "t3-code" | "t3-chat" | "grove" | "ocean" | "ember" | "iris";
export const themeAtom = persisted<ThemeId>("cubix.ui.theme", "t3-code");
export const colorModeAtom = persisted<"light" | "dark">("cubix.ui.colorMode", "dark");

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------
const preferredSolveModeAtom = perPuzzleAtom<SolveMode>("cubix.practice.modeByPuzzle", "standard");
export const solveModeAtom = atom(get => { const mode = get(preferredSolveModeAtom); return SOLVE_MODES.some(m => m.id === mode) ? mode : "standard"; }, (get, set, mode: SolveMode) => {
  if (!get(cubeSwitchLockedAtom) && SOLVE_MODES.some(m => m.id === mode)) set(preferredSolveModeAtom, mode);
});
const preferredScrambleTypeAtom = perPuzzleAtom<ScrambleType>("cubix.practice.typeByPuzzle", "random-moves");
export const scrambleTypeAtom = atom(get => {
  const info = puzzleInfo(get(puzzleAtom)), preferred = get(preferredScrambleTypeAtom);
  return info.scrambles.includes(preferred) ? preferred : info.scrambles[0];
}, (get, set, type: ScrambleType) => {
  if (!get(cubeSwitchLockedAtom) && puzzleInfo(get(puzzleAtom)).scrambles.includes(type)) set(preferredScrambleTypeAtom, type);
});
export const practiceContextAtom = atom(get => ({ puzzle: get(puzzleAtom), solveMode: get(solveModeAtom), scrambleType: get(scrambleTypeAtom) }));
const scramblesAtom = persisted<Record<string, string>>("cubix.playground.scrambleByContext", {});
export const playgroundScrambleAtom = atom(get => {
  const c = get(practiceContextAtom);
  return get(scramblesAtom)[`${c.puzzle}:${c.solveMode}:${c.scrambleType}`] ?? "";
}, (get, set, value: string) => {
  const c = get(practiceContextAtom);
  set(scramblesAtom, { ...get(scramblesAtom), [`${c.puzzle}:${c.solveMode}:${c.scrambleType}`]: value });
});

export const userAtom = atom<UserDto | null>(null);
/** Transient UI focus state; never persisted with user preferences. */
export const timerRunningAtom = atom(false);
/** The Android keyboard covers the floating navigation; reclaim that space in forms. */
export const keyboardVisibleAtom = atom(false);
