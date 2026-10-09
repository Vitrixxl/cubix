/**
 * What search engines read of the app: each public page's title, description and address, and the pages built as HTML
 * ahead of time in every language (desktop/prerender.tsx), which the API serves by their address (go-api/web.go).
 * The pages of an account, a guest's own data or the login page are not for search engines.
 */
import catalogData from "../assets/catalog.json";
import { METHODS } from "../../src/shared/methods";
import { puzzleOf, type PuzzleId } from "../../src/shared/puzzles";
import { pageUrl, readRoute, type AppRoute } from "../../src/client/lib/route";
import { tr } from "../../src/client/i18n";
import { NAME } from "./landing/content";

const catalog = catalogData as any;
const PUZZLES = catalog.puzzles.puzzles.map((p: any) => p.id) as PuzzleId[];
/** The puzzles as people search for them: "3x3", not "3×3". */
const searched = (puzzle: PuzzleId) => (catalog.puzzles.puzzles.find((p: any) => p.id === puzzle)?.label ?? puzzle).replace(/×/g, "x");
const casesOf = (puzzle: PuzzleId) => catalog.cases.filter((c: any) => puzzleOf(c) === puzzle);
/** The steps of a puzzle's algorithms (F2L, OLL, PLL…), in the catalogue's order. */
const stagesOf = (puzzle: PuzzleId) => [...new Set<string>(casesOf(puzzle).map((c: any) => c.stage))];

/**
 * A big cube's copy of a 3×3 case ("4x4 OLL 21", the same algorithm on more layers) stands for the 3×3 one: search
 * engines are given the 3×3 case alone.
 */
export function canonicalCase(id: string): string {
  const original = /^(\d)x\1 (.+)$/.exec(id)?.[2];
  return original && catalog.cases.some((c: any) => c.id === original) ? original : id;
}

export interface PageSeo {
  /** The page's address, without the language prefix: what search engines keep of it. */
  path: string;
  title: string;
  description: string;
  /** schema.org's breadcrumb trail, by name and address. */
  trail: [name: string, path: string][];
}

/** The page's full title, as the tab and search results show it. */
export const pageTitle = (seo: PageSeo) => `${seo.title} | ${NAME}`;
const short = (text: string, length = 158) => (text.length <= length ? text : text.slice(0, text.lastIndexOf(" ", length - 1)) + "…");

/** A public page's title, description and address, in the current language; null for a page that is not for search engines. */
export function pageSeo(route: AppRoute | null, puzzle: PuzzleId = "333"): PageSeo | null {
  if (!route) return null;
  if (route.puzzle) puzzle = route.puzzle;
  const name = searched(puzzle);
  const home: [string, string] = [NAME, "/"];
  switch (route.page) {
    case "playground":
      return {
        path: pageUrl("playground", { puzzle }),
        title: tr("{0} timer: free online speedcubing timer", { 0: name }),
        description: tr("Time your {0} solves with official WCA scrambles, averages (ao5, ao12, ao100), a progress chart and smart cube support. Free, without an account.", { 0: name }),
        trail: [home, [tr("{0} timer", { 0: name }), pageUrl("playground", { puzzle })]],
      };
    case "algorithms": {
      const c = route.caseId ? catalog.cases.find((x: any) => x.id === route.caseId) : undefined;
      const list = pageUrl("algorithms", { puzzle: c ? puzzleOf(c) : puzzle });
      if (!c) {
        const stages = stagesOf(puzzle);
        if (!stages.length) return null;
        return {
          path: list,
          title: tr("{0} algorithms: {1}", { 0: name, 1: stages.join(", ") }),
          description: tr("Every {0} case with its best algorithms, its diagram and a trainer: {1}. {2} cases, free, offline too.", { 0: name, 1: stages.join(", "), 2: casesOf(puzzle).length }),
          trail: [home, [tr("{0} algorithms", { 0: name }), list]],
        };
      }
      const algs = (c.algorithms ?? []).slice(0, 3).map((a: any) => a.alg);
      const label = c.name && c.name !== c.id ? `${c.id} (${tr(c.name)})` : c.id;
      return {
        path: pageUrl("algorithms", { caseId: canonicalCase(c.id) }),
        title: tr("{0} algorithm", { 0: label }),
        description: short(
          tr("The best algorithms for {0}, a {1} case of the {2}:", { 0: c.id, 1: tr(c.setLabel ?? c.stage), 2: searched(puzzleOf(c)) }) +
            " " + algs.join(" · ") + (c.setup ? ". " + tr("Setup: {0}.", { 0: c.setup }) : "."),
        ),
        trail: [home, [tr("{0} algorithms", { 0: searched(puzzleOf(c)) }), list], [tr(c.setLabel ?? c.stage), list], [c.id, pageUrl("algorithms", { caseId: c.id })]],
      };
    }
    case "learn": {
      const list = pageUrl("learn", { puzzle });
      const method = METHODS[puzzle]?.find((m) => m.id === route.learnMethod);
      if (!method) {
        return {
          path: list,
          title: tr("Learn to solve the {0}: {1}", { 0: name, 1: METHODS[puzzle].map((m) => tr(m.name)).join(", ") }),
          description: tr("Step-by-step courses to solve the {0}, from your first solve to advanced methods, with the algorithms of each step in 3D.", { 0: name }),
          trail: [home, [tr("Learn the {0}", { 0: name }), list]],
        };
      }
      const index = Math.min(route.learnStep ?? 0, method.steps.length - 1), step = method.steps[index]!;
      const path = pageUrl("learn", { puzzle, learnMethod: method.id, ...(index ? { learnStep: index } : {}) });
      return {
        path,
        title: tr("{0} method for the {1}, step {2}: {3}", { 0: tr(method.name), 1: name, 2: index + 1, 3: tr(step.title) }),
        description: short(index ? tr(step.text) : tr(method.summary) + " " + tr(step.text)),
        trail: [home, [tr("Learn the {0}", { 0: name }), list], [tr(method.name), pageUrl("learn", { puzzle, learnMethod: method.id })], [tr(step.title), path]],
      };
    }
    case "training":
      if (route.trainingStep !== "setup" || !stagesOf(puzzle).length) return null;
      return {
        path: pageUrl("training", { puzzle }),
        title: tr("{0} algorithm trainer", { 0: name }),
        description: tr("Drill the {0} cases you are learning: pick them, solve them on random scrambles and see which ones slow you down. Free, without an account.", { 0: name }),
        trail: [home, [tr("{0} algorithm trainer", { 0: name }), pageUrl("training", { puzzle })]],
      };
    default:
      return null;
  }
}

/** The page of an address, in the current language; null for a page that is not for search engines. */
export const seoOf = (pathname: string, search: string, puzzle?: PuzzleId) => pageSeo(readRoute(pathname, search), puzzle);

/**
 * The file a page is written to under dist/web/pages/<language>/, as the API finds it from an address: its path, then
 * `@<puzzle>` and `~<step>` when the address names them (web.rs tries without the step, then without either).
 */
export function pageFile(path: string) {
  const url = new URL(path, "https://x");
  const puzzle = url.searchParams.get("puzzle"), step = url.searchParams.get("step");
  return decodeURIComponent(url.pathname.slice(1)) + (puzzle ? "@" + puzzle : "") + (puzzle && step ? "~" + step : "") + ".html";
}

/**
 * Every page built ahead of time, by address: each puzzle's timer, algorithms, courses and trainer, every course step
 * and every case (a big cube's copies of the 3×3 cases aside). The 3×3's pages but its course steps also answer without
 * a puzzle (`/timer`).
 */
export function prerenderedPages(): { url: string; files: string[] }[] {
  const pages: { url: string; files: string[] }[] = [];
  const add = (url: string, bare = false) => {
    const file = pageFile(url);
    pages.push({ url, files: bare && !file.includes("~") ? [file, file.replace("@333.", ".")] : [file] });
  };
  for (const puzzle of PUZZLES) {
    const main = puzzle === "333";
    add(pageUrl("playground", { puzzle }), main);
    if (stagesOf(puzzle).length) {
      add(pageUrl("algorithms", { puzzle }), main);
      add(pageUrl("training", { puzzle }), main);
    }
    add(pageUrl("learn", { puzzle }), main);
    for (const method of METHODS[puzzle])
      method.steps.forEach((_, step) => add(pageUrl("learn", { puzzle, learnMethod: method.id, ...(step ? { learnStep: step } : {}) }), main));
  }
  for (const c of catalog.cases) if (canonicalCase(c.id) === c.id) add(pageUrl("algorithms", { caseId: c.id }));
  return pages;
}
