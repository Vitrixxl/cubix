/** URLs own navigation. The data store only receives the route's practice context. */
import type { NavigateFunction } from "react-router";
import { isPuzzle, type PuzzleId } from "../../src/shared/puzzles";
export interface AppRoute { page: string; caseId: string; /** Coaching: the view and its argument, e.g. "coach/<id>". */ coaching?: string; profileMode: string; trainingStep: "setup" | "practice"; learnMethod: string; learnStep?: number; puzzle?: PuzzleId }
const pages: Record<string, string> = { timer: "playground", algorithms: "algorithms", training: "training", duel: "duel", learn: "learn", coaching: "coaching", profile: "profile", onboarding: "onboarding" };
const paths = Object.fromEntries(Object.entries(pages).map(([path, page]) => [page, path]));
let navigate: NavigateFunction | undefined;
export function bindNavigation(fn: NavigateFunction) { navigate = fn; return () => { if (navigate === fn) navigate = undefined; }; }
export function go(to: string | number, replace = false) { if (typeof to === "number") void navigate?.(to); else void navigate?.(to, { replace }); }
export function pageUrl(page: string, options: Partial<AppRoute> = {}) {
  if (page === "coaching") return "/coaching" + (options.coaching ? "/" + options.coaching.split("/").map(encodeURIComponent).join("/") : "");
  const detail = page === "algorithms" ? options.caseId : page === "learn" ? options.learnMethod : page === "profile" && options.profileMode !== "overview" ? options.profileMode : page === "training" && options.trainingStep === "practice" ? "practice" : "";
  const query = new URLSearchParams();
  if (options.puzzle) query.set("puzzle", options.puzzle);
  if (page === "learn" && detail && options.learnStep !== undefined) query.set("step", String(options.learnStep));
  return `/${paths[page] ?? "timer"}${detail ? "/" + encodeURIComponent(detail) : ""}${query.size ? "?" + query : ""}`;
}
export const goPage = (page: string, options: Partial<AppRoute> = {}, replace = false) => go(pageUrl(page, options), replace);
export function readRoute(pathname: string, search: string): AppRoute | null {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return null;
  const page = pages[parts[0]!];
  if (page === "coaching") {
    if (parts.length > 4) return null;
    try { return { page, caseId: "", profileMode: "overview", trainingStep: "setup", learnMethod: "", coaching: parts.slice(1).map(decodeURIComponent).join("/") }; } catch { return null; }
  }
  if (!page || parts.length > 2) return null;
  let detail = "";
  try { detail = decodeURIComponent(parts[1] ?? ""); } catch { return null; }
  if (["playground", "duel", "onboarding"].includes(page) && detail) return null;
  if (page === "profile" && detail && !["playground", "training", "achievements", "duels"].includes(detail)) return null;
  if (page === "training" && detail && detail !== "practice") return null;
  const query = new URLSearchParams(search), puzzle = query.get("puzzle"), step = query.get("step");
  if (puzzle && !isPuzzle(puzzle)) return null;
  if (step !== null && (page !== "learn" || !detail || !/^\d{1,3}$/.test(step))) return null;
  return { page, caseId: page === "algorithms" ? detail : "", profileMode: page === "profile" ? detail || "overview" : "overview", trainingStep: page === "training" && detail ? "practice" : "setup", learnMethod: page === "learn" ? detail : "", ...(isPuzzle(puzzle) ? { puzzle } : {}), ...(step !== null ? { learnStep: Number(step) } : {}) };
}
