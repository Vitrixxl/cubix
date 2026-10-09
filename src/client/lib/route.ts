/** The app's addresses as routes and back, free of the router: the web app's and the links the Android app opens. */
import { isPuzzle, type PuzzleId } from "../../shared/puzzles";
export interface AppRoute { page: string; caseId: string; /** Coaching: the view and its argument, e.g. "coach/<id>". */ coaching?: string; /** The community, tournaments and matches: the view under the page, e.g. "groups/<id>/battles". */ view?: string; profileMode: string; trainingStep: "setup" | "practice"; learnMethod: string; learnStep?: number; puzzle?: PuzzleId }
const pages: Record<string, string> = { login: "login", timer: "playground", algorithms: "algorithms", training: "training", duel: "duel", learn: "learn", coaching: "coaching", community: "community", tournaments: "tournaments", match: "match", profile: "profile", onboarding: "onboarding" };
/** Pages whose address goes deeper than one level: a view and its arguments. */
const NESTED = ["community", "tournaments", "match"];
const paths = Object.fromEntries(Object.entries(pages).map(([path, page]) => [page, path]));
export function pageUrl(page: string, options: Partial<AppRoute> = {}) {
  if (page === "coaching") return "/coaching" + (options.coaching ? "/" + options.coaching.split("/").map(encodeURIComponent).join("/") : "");
  if (NESTED.includes(page)) return "/" + page + (options.view ? "/" + options.view.split("/").map(encodeURIComponent).join("/") : "");
  const detail = page === "algorithms" ? options.caseId : page === "learn" ? options.learnMethod : page === "profile" && options.profileMode !== "overview" ? options.profileMode : page === "training" && options.trainingStep === "practice" ? "practice" : "";
  const query = new URLSearchParams();
  if (options.puzzle) query.set("puzzle", options.puzzle);
  if (page === "learn" && detail && options.learnStep !== undefined) query.set("step", String(options.learnStep));
  return `/${paths[page] ?? "timer"}${detail ? "/" + encodeURIComponent(detail) : ""}${query.size ? "?" + query : ""}`;
}
/** The app in a language other than English lives under its prefix (/fr/timer, /de/algorithms…), English at the root. */
const PREFIX = /^\/(fr|es|it|de)(?=\/|$)/;
/** An address's language prefix, if any, and the app's address under it. */
export function splitLanguage(pathname: string): { language?: "fr" | "es" | "it" | "de"; path: string } {
  const language = PREFIX.exec(pathname)?.[1] as "fr" | "es" | "it" | "de" | undefined;
  return { language, path: language ? pathname.slice(language.length + 1) || "/" : pathname };
}
/** The app's address in `language`: English at the root, any other under its prefix. */
export const localePath = (language: string, path: string) => (language === "en" ? path : "/" + language + path);
export function readRoute(pathname: string, search: string): AppRoute | null {
  const parts = splitLanguage(pathname).path.split("/").filter(Boolean);
  if (!parts.length) return null;
  const page = pages[parts[0]!];
  if (page === "coaching") {
    if (parts.length > 4) return null;
    try { return { page, caseId: "", profileMode: "overview", trainingStep: "setup", learnMethod: "", coaching: parts.slice(1).map(decodeURIComponent).join("/") }; } catch { return null; }
  }
  if (NESTED.includes(page!)) {
    if (parts.length > 4 || (page === "match" && !/^\d+$/.test(parts[1] ?? ""))) return null;
    try { return { page: page!, caseId: "", profileMode: "overview", trainingStep: "setup", learnMethod: "", view: parts.slice(1).map(decodeURIComponent).join("/") }; } catch { return null; }
  }
  if (!page || parts.length > 2) return null;
  let detail = "";
  try { detail = decodeURIComponent(parts[1] ?? ""); } catch { return null; }
  if (["playground", "duel", "onboarding", "login"].includes(page) && detail) return null;
  if (page === "profile" && detail && !["playground", "training", "achievements", "duels", "analysis"].includes(detail)) return null;
  if (page === "training" && detail && detail !== "practice") return null;
  const query = new URLSearchParams(search), puzzle = query.get("puzzle"), step = query.get("step");
  if (puzzle && !isPuzzle(puzzle)) return null;
  if (step !== null && (page !== "learn" || !detail || !/^\d{1,3}$/.test(step))) return null;
  return { page, caseId: page === "algorithms" ? detail : "", profileMode: page === "profile" ? detail || "overview" : "overview", trainingStep: page === "training" && detail ? "practice" : "setup", learnMethod: page === "learn" ? detail : "", ...(isPuzzle(puzzle) ? { puzzle } : {}), ...(step !== null ? { learnStep: Number(step) } : {}) };
}
/** The pages of an account: a guest, who uses the app on this device only, is sent to the login page instead. The
 * analysis of the smart cube solves, under the profile, reads this device's solves and stays open. */
export const ACCOUNT_PAGES = ["duel", "coaching", "community", "tournaments", "match", "profile"];
export const accountOnly = (route: Pick<AppRoute, "page" | "profileMode">) => ACCOUNT_PAGES.includes(route.page) && !(route.page === "profile" && route.profileMode === "analysis");
/** The login page, back to `next` (an address of the app) once signed in. */
export const loginUrl = (next?: string) => "/login" + (next && next !== "/login" ? "?redirect=" + encodeURIComponent(next) : "");
/** Where the login page goes once signed in: its `redirect`, if it is an address of this site, else the timer. */
export function loginNext(search: string) {
  const next = new URLSearchParams(search).get("redirect") ?? "";
  return /^\/(?![/\\])/.test(next) ? next : "/timer";
}
