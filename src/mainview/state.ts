import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { api } from "./api";
import type { UserDto, CaseDto, CaseStatsDto, Stage } from "../shared/types";

// ---------------------------------------------------------------------------
// Routing (no router dependency: a single atom)
// ---------------------------------------------------------------------------
export type Route =
  | { page: "algorithms"; caseId?: string }
  | { page: "training"; autostart?: boolean }
  | { page: "playground" }
  | { page: "community" }
  | { page: "profile"; username?: string };

const historyRoute = typeof window !== "undefined" ? (window.history.state?.cubixRoute as Route | undefined) : undefined;
export const routeAtom = atom<Route>(historyRoute ?? { page: "algorithms" });

/** Stage tab (F2L / OLL / PLL) and set per stage on the algorithms page, persisted. */
export const stageAtom = atomWithStorage<Stage>("cubix.algs.stage", "F2L");
export const setByStageAtom = atomWithStorage<Record<Stage, string>>("cubix.algs.set", { F2L: "f2l", OLL: "oll", PLL: "pll" });

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
export const casesAtom = atom<Promise<CaseDto[]>>(async () => api.cases());
export const setsAtom = atom(async () => api.sets());
export const casesByIdAtom = atom(async (get) => new Map((await get(casesAtom)).map((c) => [c.id, c])));

/** bump to refetch stats */
export const statsVersionAtom = atom(0);
export const statsAtom = atom(async (get) => {
  get(statsVersionAtom);
  const list = await api.stats();
  return new Map<string, CaseStatsDto>(list.map((s) => [s.caseId, s]));
});

// ---------------------------------------------------------------------------
// Training preferences
// ---------------------------------------------------------------------------
export const selectedCaseIdsAtom = atomWithStorage<string[]>("cubix.training.selection", []);
export const hideAlgorithmAtom = atomWithStorage<boolean>("cubix.training.hideAlg", true);
export const randomAufAtom = atomWithStorage<boolean>("cubix.training.randomAuf", true);

export type ThemeId = "t3-code" | "t3-chat" | "grove" | "ocean" | "ember" | "iris";
export const themeAtom = atomWithStorage<ThemeId>("cubix.ui.theme", "t3-code");

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------
/** Current playground scramble, kept across page changes and reloads. */
export const playgroundScrambleAtom = atomWithStorage<string>("cubix.playground.scramble", "", undefined, { getOnInit: true });

export const userAtom = atom<UserDto | null>(null);
