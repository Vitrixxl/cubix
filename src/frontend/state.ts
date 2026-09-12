import { isCubeSize, puzzleId, puzzleOf, puzzleInfo, isPuzzle, SOLVE_MODES, type PuzzleId, type SolveMode, type ScrambleType } from "../shared/puzzles";
import { sets as catalogSets } from "./local/catalog";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { api } from "./api";
import { cubeModelAsset } from "./lib/cube-library";
import type { UserDto, CaseDto, CaseStatsDto, Stage } from "../shared/types";

// ---------------------------------------------------------------------------
// Routing (no router dependency: a single atom)
// ---------------------------------------------------------------------------
export type { Route } from "./lib/navigation";
import { initialRoute, type Route } from "./lib/navigation";

export const routeAtom = atom<Route>(initialRoute());
export const viewportSizeAtom = atom({ width: window.innerWidth, height: window.innerHeight });

/** One persisted puzzle context for every application tab. */
const legacyCube = (() => { try { const size = JSON.parse(localStorage.getItem("cubix.cube") ?? "3"); return isCubeSize(size) ? puzzleId(size) : "333"; } catch { return "333"; } })();
const storedPuzzleAtom = atomWithStorage<PuzzleId>("cubix.puzzle", legacyCube, undefined, { getOnInit: true });
export const puzzleAtom = atom(get => { const value = get(storedPuzzleAtom); return isPuzzle(value) ? value : "333"; }, (get, set, puzzle: PuzzleId) => {
  if (!isPuzzle(puzzle) || get(cubeSwitchLockedAtom)) return;
  set(storedPuzzleAtom, puzzle);
  const route = get(routeAtom);
  if (route.page === "algorithms") set(routeAtom, { page: "algorithms" });
  if (route.page === "profile") set(routeAtom, { ...route, caseId: undefined });
});
/** Numeric geometry is only used by the cube catalogue and cube renderer. */
export const cubeSizeAtom = atom(get => puzzleInfo(get(puzzleAtom)).cubeSize ?? 3);
export const cubeSwitchLockedAtom = atom(false);
/** Each cube remembers its own last stage, training selection and scramble. */
function perCubeAtom<T>(key: string, fallback: T, legacyKey?: string) {
  const values = atomWithStorage<Record<string, T>>(key, {}, undefined, { getOnInit: true });
  let legacy = fallback;
  if (legacyKey) { try { const raw = localStorage.getItem(legacyKey); if (raw !== null) legacy = JSON.parse(raw); } catch {} }
  const read = (all: Record<string, T>, puzzle: PuzzleId) => all[puzzle] ?? all[String(puzzleInfo(puzzle).cubeSize)] ?? (puzzle === "333" ? legacy : fallback);
  return atom(get => read(get(values),get(puzzleAtom)), (get, set, update: T | ((value: T) => T)) => {
    const cube = get(puzzleAtom);
    const previous = read(get(values),cube);
    set(values, { ...get(values), [cube]: typeof update === "function" ? (update as (value: T) => T)(previous) : update });
  });
}
const preferredStageAtom = perCubeAtom<Stage | null>("cubix.algs.stageByCube", null, "cubix.algs.stage");
export const stageAtom = atom(get => {
  const available = catalogSets.filter(s => puzzleOf(s) === get(puzzleAtom));
  const preferred = get(preferredStageAtom);
  return preferred !== null && available.some(s => s.stage === preferred) ? preferred : available[0]?.stage ?? "F2L";
}, (_get, set, value: Stage) => set(preferredStageAtom, value));
export const setByStageAtom = perCubeAtom<Partial<Record<Stage, string>>>("cubix.algs.setByCube", { F2L: "f2l", OLL: "oll", PLL: "pll" }, "cubix.algs.set");
export const trainedOnlyAtom = atomWithStorage<boolean>("cubix.algs.trainedOnly", false);
export const collapsedAlgorithmGroupsAtom = atomWithStorage<Record<string, boolean>>("cubix.algs.collapsedGroups", {});

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
export const casesAtom = atom<Promise<CaseDto[]>>(async get => api.cases(get(puzzleAtom)));
export const setsAtom = atom(async get => api.sets(get(puzzleAtom)));
export const casesByIdAtom = atom(async (get) => new Map((await get(casesAtom)).map((c) => [c.id, c])));

/** bump to refetch stats */
export const statsVersionAtom = atom(0);
/** Last deleted solve, so the open lists update without refetching every timer tick. */
export const deletedSolveIdAtom = atom<number | null>(null);
export const statsAtom = atom(async (get) => {
  get(statsVersionAtom);
  const list = await api.stats(get(puzzleAtom), {solveMode:get(solveModeAtom)});
  return new Map<string, CaseStatsDto>(list.map((s) => [s.caseId, s]));
});

// ---------------------------------------------------------------------------
// Training preferences
// ---------------------------------------------------------------------------
export const selectedCaseIdsAtom = perCubeAtom<string[]>("cubix.training.selectionByCube", [], "cubix.training.selection");
export const hideAlgorithmAtom = atomWithStorage<boolean>("cubix.training.hideAlg", true);
export const randomAufAtom = atomWithStorage<boolean>("cubix.training.randomAuf", true);

export type ThemeId = "t3-code" | "t3-chat" | "grove" | "ocean" | "ember" | "iris";
export const themeAtom = atomWithStorage<ThemeId>("cubix.ui.theme", "t3-code", undefined, { getOnInit: true });
export const colorModeAtom = atomWithStorage<"light" | "dark">("cubix.ui.colorMode", "dark", undefined, { getOnInit: true });

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------
const preferredSolveModeAtom = perCubeAtom<SolveMode>("cubix.practice.modeByPuzzle", "standard");
export const solveModeAtom = atom(get => { const mode = get(preferredSolveModeAtom); return SOLVE_MODES.some(m => m.id === mode) ? mode : "standard"; }, (get, set, mode: SolveMode) => {
  if (!get(cubeSwitchLockedAtom) && SOLVE_MODES.some(m => m.id === mode)) set(preferredSolveModeAtom,mode);
});
const preferredScrambleTypeAtom = perCubeAtom<ScrambleType>("cubix.practice.typeByPuzzle", "random-moves");
export const scrambleTypeAtom = atom(get => {
  const info = puzzleInfo(get(puzzleAtom)), preferred = get(preferredScrambleTypeAtom);
  return info.scrambles.includes(preferred) ? preferred : info.scrambles[0];
}, (get, set, type: ScrambleType) => {
  if (!get(cubeSwitchLockedAtom) && puzzleInfo(get(puzzleAtom)).scrambles.includes(type)) set(preferredScrambleTypeAtom,type);
});
export const practiceContextAtom = atom(get => ({puzzle:get(puzzleAtom),solveMode:get(solveModeAtom),scrambleType:get(scrambleTypeAtom)}));
const scramblesAtom = atomWithStorage<Record<string,string>>("cubix.playground.scrambleByContext", {}, undefined, {getOnInit:true});
const legacyScrambleAtom = perCubeAtom<string>("cubix.playground.scrambleByCube", "", "cubix.playground.scramble");
export const playgroundScrambleAtom = atom(get => {
  const c = get(practiceContextAtom), key = `${c.puzzle}:${c.solveMode}:${c.scrambleType}`;
  return get(scramblesAtom)[key] ?? (c.solveMode === "standard" && c.scrambleType === "random-moves" ? get(legacyScrambleAtom) : "");
}, (get, set, value: string) => {
  const c = get(practiceContextAtom), key = `${c.puzzle}:${c.solveMode}:${c.scrambleType}`;
  set(scramblesAtom,{...get(scramblesAtom),[key]:value});
});

export const userAtom = atom<UserDto | null>(null);

export const chatVersionAtom = atom(0);
export const chatConnectionAtom = atom<"offline" | "connecting" | "online">("offline");
export const chatActivityAtom = atom(false);

/** Transient UI focus state; never persisted with user preferences. */
export const timerRunningAtom = atom(false);

/** Device preferences, applied before the first render. */
export const threeDEnabledAtom = atomWithStorage<boolean>("cubix.ui.3dPuzzles", true, undefined, { getOnInit: true });
export const animationsEnabledAtom = atomWithStorage<boolean>("cubix.ui.animations", true, undefined, { getOnInit: true });
/** Legacy brand choices never identify a physical model and are deliberately not migrated. */
const storedCubeModelSelectionAtom = atomWithStorage<Record<string, string>>("cubix.ui.cubeModels", {}, undefined, { getOnInit: true });
export const cubeModelSelectionAtom = atom(get => {
  const stored = get(storedCubeModelSelectionAtom);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(Object.entries(stored).filter(([size, id]) => id === 'generic' || cubeModelAsset(id, Number(size))));
}, (get, set, selections: Record<string, string>) => {
  if (get(cubeSwitchLockedAtom)) return;
  set(storedCubeModelSelectionAtom, Object.fromEntries(Object.entries(selections).filter(([size, id]) => id === 'generic' || cubeModelAsset(id, Number(size)))));
});
