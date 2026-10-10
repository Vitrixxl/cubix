/**
 * Statistics of the solves recorded on a smart cube. Each solve's analysis (solveAnalysis.ts) is boiled down to a
 * digest: its method, the times of its steps and of the cases it went through. Digests are then gathered by method:
 * how long each step takes, how long each case takes, and which training would help most.
 *
 * The cases of a solve also count as attempts of those cases (`caseTimes`): the algorithms page shows them beside the
 * training's own times.
 */
import type { Face } from "../../shared/cube";
import { PHASE_LABELS, type Phase, type PhaseId, type Segment, type SolveAnalysis } from "./solveAnalysis";
import { msg } from "../i18n/msg";

/** Where the times of a 3×3 case come from: its training and the solves it was done in, or one of them. */
export const CASE_SOURCES = ["all", "solves", "training"] as const;
export type CaseSource = (typeof CASE_SOURCES)[number];
export const isCaseSource = (value: unknown): value is CaseSource => CASE_SOURCES.includes(value as CaseSource);

/** The method; for CFOP, how the last layer was solved: the whole OLL then the whole PLL, each in two looks, or the ZBLL. */
export type MethodId = "cfop" | "cfop-2look" | "zb" | "zz" | "roux";
export const METHOD_LABELS: Record<MethodId, string> = { cfop: "CFOP", "cfop-2look": "CFOP, 2-look last layer", zb: "CFOP with ZBLL", zz: "ZZ", roux: "Roux" };
export type StepId = "cross" | "eoline" | "fb" | "sb" | "f2l" | "cmll" | "oll" | "pll" | "lse";
/** In the order of a solve, the steps of every method together. */
export const STEP_LABELS: Record<StepId, string> = {
  cross: msg("Cross"),
  eoline: PHASE_LABELS.eoline,
  fb: PHASE_LABELS.fb,
  sb: PHASE_LABELS.sb,
  f2l: "F2L",
  cmll: PHASE_LABELS.cmll,
  oll: "OLL",
  pll: "PLL",
  lse: PHASE_LABELS.lse,
};
/** The steps of each method, in order: ZZ's two blocks make its F2L. */
const CFOP_STEPS: StepId[] = ["cross", "f2l", "oll", "pll"];
export const METHOD_STEPS: Record<MethodId, StepId[]> = { cfop: CFOP_STEPS, "cfop-2look": CFOP_STEPS, zb: CFOP_STEPS, zz: ["eoline", "f2l", "oll", "pll"], roux: ["fb", "sb", "cmll", "lse"] };
/** The catalogue's stage of a case of each step. */
export type CaseStep = "f2l" | "oll" | "pll" | "zbll";

export interface Timing {
  /** Milliseconds from the end of the step before to the end of this one. */
  duration: number;
  /** The pause before its first turn. */
  recognition: number;
  execution: number;
  turns: number;
}
export interface StepTiming extends Timing {
  /** Nothing to do: the step before solved it. */
  skip: boolean;
}
export interface CaseTiming extends Timing {
  id: string;
  name: string;
  step: CaseStep;
}
export interface SolveDigest {
  id: number;
  at: string;
  /** The solve's time as saved, penalty included; null for a DNF. */
  time: number | null;
  method: MethodId;
  /** The cross colour (Roux: the blocks' bottom colour), as a held face. */
  cross: Face;
  turns: number;
  /** First turn to last, by the cube's clock. */
  duration: number;
  /** The steps of its method (`METHOD_STEPS`). */
  steps: Partial<Record<StepId, StepTiming>>;
  /** The cases the solve went through, in order: each pair, then each look of the last layer. */
  cases: CaseTiming[];
  /** F2L pairs solved along with the cross: 1 for an XCross, 2 for an XXCross… Absent in digests made before. */
  xcross?: number;
}

const timing = (part: Segment): Timing => ({ duration: part.end - part.start, recognition: part.recognition, execution: part.execution, turns: part.turns.length });
const sum = (parts: Timing[]): Timing =>
  parts.reduce((total, t) => ({ duration: total.duration + t.duration, recognition: total.recognition + t.recognition, execution: total.execution + t.execution, turns: total.turns + t.turns }), {
    duration: 0,
    recognition: 0,
    execution: 0,
    turns: 0,
  });

/** The cases a step was done with: each of its looks when it took two, else its own case. */
function casesOf(phase: Phase, step: CaseStep): CaseTiming[] {
  if (phase.skip) return [];
  const parts: Segment[] = phase.looks ?? [phase];
  return parts.flatMap((part) => (part.case ? [{ ...timing(part), id: part.case.id, name: part.case.name, step }] : []));
}

/** The phases of a solve each step gathers: ZZ's F2L is its two blocks, CFOP's its four pairs. */
const STEP_PHASES: Record<StepId, PhaseId[]> = {
  cross: ["cross"],
  eoline: ["eoline"],
  fb: ["fb"],
  sb: ["sb"],
  f2l: ["f2l1", "f2l2", "f2l3", "f2l4", "fb", "sb"],
  cmll: ["cmll"],
  oll: ["oll"],
  pll: ["pll"],
  lse: ["lse"],
};

export function digest(analysis: SolveAnalysis, solve: { id: number; created_at: string; time: number | null }): SolveDigest {
  const { phases } = analysis,
    oll = phases.find((p) => p.id === "oll"),
    pll = phases.find((p) => p.id === "pll"),
    method: MethodId =
      analysis.method !== "cfop" ? analysis.method : oll?.label === "ZBLL" ? "zb" : oll?.looks || pll?.looks ? "cfop-2look" : "cfop",
    step = (parts: Phase[]): StepTiming => ({ ...sum(parts.filter((p) => !p.skip).map(timing)), skip: parts.every((p) => p.skip) }),
    cross = phases.find((p) => p.id === "cross");
  return {
    id: solve.id,
    at: solve.created_at,
    time: solve.time,
    method,
    cross: analysis.cross,
    turns: analysis.turns,
    duration: analysis.time,
    steps: Object.fromEntries(METHOD_STEPS[method].map((id) => [id, step(phases.filter((p) => STEP_PHASES[id].includes(p.id)))])),
    ...(cross && { xcross: /^X*/.exec(cross.label)![0].length }),
    // The cases of the catalogue: each pair, then each look of the last layer.
    cases: phases.flatMap((p) => (p.id.startsWith("f2l") ? casesOf(p, "f2l") : p.id === "oll" ? casesOf(p, p.label === "ZBLL" ? "zbll" : "oll") : p.id === "pll" ? casesOf(p, "pll") : [])),
  };
}

export interface StepStats extends Timing {
  id: StepId;
  label: string;
  /** Solves where the step was done (not skipped). */
  count: number;
  skips: number;
  /** Turns a second while turning, recognition left out. */
  tps: number;
  /** Its part of the solve, from 0 to 1. */
  share: number;
}
export interface CaseStats extends Timing {
  id: string;
  name: string;
  step: CaseStep;
  count: number;
  best: number;
}
export interface MethodStats {
  id: MethodId | "all";
  label: string;
  count: number;
  /** Mean of the solves' times, penalties included, DNFs left out. */
  mean: number | null;
  best: number | null;
  turns: number;
  tps: number;
  steps: StepStats[];
  cases: CaseStats[];
  /** Solves whose cross came with at least one F2L pair (XCross or more). */
  xcross: number;
}
export interface TrainingSuggestion {
  id: string;
  title: string;
  detail: string;
  /** The store's action that starts it. */
  action: string;
}
export interface SmartAnalysisDto {
  count: number;
  /** Every solve together first, then each method used, the most used first. */
  methods: MethodStats[];
  suggestions: TrainingSuggestion[];
  /** The latest analysed solves, newest first. */
  latest: { id: number; at: string; time: number | null; method: MethodId; duration: number; turns: number; steps: Partial<Record<StepId, number>> }[];
}

/** Adds `value` to the list kept under `key`. */
function appendTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const meanTiming = (parts: Timing[]): Timing => {
  const total = sum(parts),
    n = parts.length || 1;
  return { duration: total.duration / n, recognition: total.recognition / n, execution: total.execution / n, turns: total.turns / n };
};

function gather(id: MethodId | "all", label: string, digests: SolveDigest[]): MethodStats {
  const times = digests.map((d) => d.time).filter((t): t is number => t !== null),
    duration = average(digests.map((d) => d.duration));
  // A method's own steps; every solve together, the steps of the methods used, in the order of a solve.
  const used = id === "all" ? new Set(digests.flatMap((d) => METHOD_STEPS[d.method])) : new Set(METHOD_STEPS[id]),
    ids = (Object.keys(STEP_LABELS) as StepId[]).filter((step) => used.has(step));
  const steps = (id === "all" && !digests.length ? CFOP_STEPS : ids).map((step): StepStats => {
    const having = digests.flatMap((d) => d.steps[step] ?? []),
      done = having.filter((t) => !t.skip),
      mean = meanTiming(done);
    return {
      id: step,
      label: STEP_LABELS[step],
      ...mean,
      count: done.length,
      skips: having.length - done.length,
      tps: mean.execution > 0 ? mean.turns / (mean.execution / 1000) : 0,
      // Skipped steps count as nothing: the shares of a method's steps add up to its whole solve.
      share: duration > 0 ? average(digests.map((d) => d.steps[step]?.duration ?? 0)) / duration : 0,
    };
  });
  const byCase = new Map<string, CaseTiming[]>();
  for (const d of digests) for (const c of d.cases) appendTo(byCase, c.id, c);
  const cases = [...byCase.values()]
    .map((list): CaseStats => ({ id: list[0]!.id, name: list[0]!.name, step: list[0]!.step, count: list.length, best: Math.min(...list.map((c) => c.duration)), ...meanTiming(list) }))
    .sort((a, b) => b.duration - a.duration);
  const turns = average(digests.map((d) => d.turns));
  return {
    id,
    label,
    count: digests.length,
    mean: times.length ? average(times) : null,
    best: times.length ? Math.min(...times) : null,
    turns,
    tps: duration > 0 ? turns / (duration / 1000) : 0,
    steps,
    cases,
    xcross: digests.filter((d) => (d.xcross ?? 0) > 0).length,
  };
}

/** Cases slower than their step's usual case, the slowest first: the ones worth training. */
function slowest(all: MethodStats, step: CaseStep, key: "duration" | "recognition", count = 4) {
  const cases = all.cases.filter((c) => c.step === step),
    usual = average(cases.map((c) => c[key]));
  return cases
    .filter((c) => c[key] > usual)
    .sort((a, b) => b[key] - a[key])
    .slice(0, count);
}

const STEP_NAMES: Record<CaseStep, string> = { f2l: "F2L pairs", oll: "OLLs", pll: "PLLs", zbll: "ZBLLs" };
const seconds = (ms: number) => (ms / 1000).toFixed(2) + " s";
const names = (cases: CaseStats[]) => cases.map((c) => c.name).join(", ");

/** What to train next, from where the solves lose time. */
export function suggest(all: MethodStats, methods: MethodStats[]): TrainingSuggestion[] {
  const out: TrainingSuggestion[] = [];
  const step = (id: StepId) => all.steps.find((s) => s.id === id);
  // The step that takes the largest part of the solve compared with a usual CFOP solve.
  const USUAL: Partial<Record<StepId, number>> = { cross: 0.15, f2l: 0.5, oll: 0.15, pll: 0.2 };
  const heaviest = all.steps.filter((s) => USUAL[s.id]).sort((a, b) => b.share / USUAL[b.id]! - a.share / USUAL[a.id]!)[0];
  for (const id of ["f2l", "oll", "pll", "zbll"] as CaseStep[]) {
    const cases = slowest(all, id, "duration");
    if (!cases.length) continue;
    out.push({
      id: "slow-" + id,
      title: msg("Your slowest {0}", { 0: STEP_NAMES[id] }),
      detail: msg("{0}: {1} for the slowest, {2} for a usual one.", { 0: names(cases), 1: seconds(cases[0]!.duration), 2: seconds(average(all.cases.filter((c) => c.step === id).map((c) => c.duration))) }),
      action: "trainCases:" + cases.map((c) => c.id).join(","),
    });
  }
  // A long pause before the last layer's algorithms: recognising them is what to train.
  const ll = [step("oll"), step("pll")].filter((s) => s?.count) as StepStats[],
    pause = ll.length ? average(ll.map((s) => s.recognition)) : 0;
  if (pause >= 600) {
    const cases = [...slowest(all, "oll", "recognition", 3), ...slowest(all, "pll", "recognition", 3)];
    if (cases.length)
      out.push({
        id: "recognition",
        title: msg("Recognise the last layer sooner"),
        detail: msg("{0} of pause before an OLL or a PLL, longest on {1}.", { 0: seconds(pause), 1: names(cases) }),
        action: "trainCases:" + cases.map((c) => c.id).join(","),
      });
  }
  // A cross of many turns: planning it during inspection, with Cross training.
  const cross = step("cross");
  if (cross?.count && (cross.turns > 8 || heaviest?.id === "cross"))
    out.push({
      id: "cross",
      title: msg("Plan the whole cross"),
      detail: msg("{0} turns and {1} for your cross; an optimal one takes 8 at most.", { 0: cross.turns.toFixed(1), 1: seconds(cross.duration) }),
      action: "trainingStart:cross",
    });
  // The last layer in two looks: the full sets save a look each.
  const twoLook = methods.find((m) => m.id === "cfop-2look");
  if (twoLook && twoLook.count >= Math.max(1, all.count / 2)) {
    const ollLooks = twoLook.cases.some((c) => c.step === "oll" && c.id.startsWith("2look")),
      track = ollLooks ? "OLL" : "PLL";
    out.push({
      id: "full-ll",
      title: msg("Learn the full {0}", { 0: track }),
      detail: msg("{0} of your {1} solves took two looks for the last layer. Learning the full {2}, in the CFOP course, saves one.", { 0: twoLook.count, 1: all.count, 2: track }),
      // New cases are learned in the courses; the training drills the learned ones.
      action: "learnFrom:333:cfop",
    });
  }
  return out;
}

export function smartAnalysis(digests: SolveDigest[]): SmartAnalysisDto {
  const all = gather("all", msg("All solves"), digests),
    methods = (Object.keys(METHOD_LABELS) as MethodId[])
      // Every method the analysis reads, used or not yet: the most used first.
      .map((id) => gather(id, METHOD_LABELS[id], digests.filter((d) => d.method === id)))
      .sort((a, b) => b.count - a.count);
  return {
    count: digests.length,
    methods: digests.length ? [all, ...methods] : [],
    suggestions: digests.length ? suggest(all, methods.filter((m) => m.count)) : [],
    latest: [...digests]
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.id - a.id))
      .slice(0, 50)
      .map((d) => ({
        id: d.id,
        at: d.at,
        time: d.time,
        method: d.method,
        duration: d.duration,
        turns: d.turns,
        steps: Object.fromEntries(Object.entries(d.steps).map(([id, t]) => [id, t.duration])) as Partial<Record<StepId, number>>,
      })),
  };
}

/** A case done during a solve, as an attempt of that case: when, how long it took, and the solve it was part of. */
export interface CaseAttempt {
  solveId: number;
  at: string;
  time: number;
}
/** The cases of every solve, case by case, oldest first. */
export function caseTimes(digests: SolveDigest[]) {
  const out = new Map<string, CaseAttempt[]>();
  for (const d of [...digests].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id - b.id)))
    for (const c of d.cases) appendTo(out, c.id, { solveId: d.id, at: d.at, time: Math.round(c.duration) });
  return out;
}
