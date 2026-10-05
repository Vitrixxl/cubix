import type { Penalty } from "../../shared/types";
import { averageOf, best, bestAverage, effective, fmtTime, mean, median, rollingAverages, worstAverage } from "./format";
import type { Tone } from "./tone";

/** Solves must be oldest first; rolling averages include DNF attempts. */
export function practiceSummary(solves: readonly { time_ms: number; penalty: Penalty }[]) {
  const times = solves.map(s => effective(s.time_ms, s.penalty));
  return {
    count: times.length, times,
    validCount: times.filter(time => time !== null).length,
    best: best(times), mean: mean(times),
    ao5: times.length >= 5 ? averageOf(times.slice(-5)) : null,
    ao12: times.length >= 12 ? averageOf(times.slice(-12)) : null,
  };
}

/** Candidates are chosen by the screen; grouping and stable frequency ordering are shared. */
export function trainingSessionRows<C extends { id: string }, S extends { case_id: string | null; time_ms: number; penalty: Penalty }>(cases: readonly C[], solves: readonly S[]) {
  const byCase = new Map<string, S[]>();
  for (const solve of solves) {
    if (!solve.case_id) continue;
    const list = byCase.get(solve.case_id);
    if (list) list.push(solve); else byCase.set(solve.case_id, [solve]);
  }
  return cases.map(c => {
    const list = byCase.get(c.id) ?? [];
    return { c, solves: list, ...practiceSummary(list) };
  }).sort((a, b) => b.count - a.count);
}

/** A figure as drawn: its label, its value and the tone it is drawn in. */
export type Metric = [label: string, value: string, tone: Tone];

/**
 * The session figures under the timer: Best and Best Ao5/Ao12 in green, Worst in red (DNF as soon as one attempt is a
 * DNF), the current averages in the accent.
 */
export function sessionMetrics(solves: readonly { time_ms: number; penalty: Penalty }[]): Metric[] {
  const summary = practiceSummary(solves), times = summary.times;
  const worst = !times.length ? fmtTime(null) : times.includes(null) ? "DNF" : fmtTime(Math.max(...(times as number[])));
  return [
    ["Best", fmtTime(summary.best), "good"],
    ["Worst", worst, "bad"],
    ["Mean", fmtTime(summary.mean), ""],
    ["Ao5", fmtTime(summary.ao5), "accent"],
    ["Best Ao5", fmtTime(bestAverage(times, 5)), "good"],
    ["Ao12", fmtTime(summary.ao12), "accent"],
    ["Best Ao12", fmtTime(bestAverage(times, 12)), "good"],
    ["Solves", String(summary.count), ""],
  ];
}

/**
 * The figures the timer's band shows, chosen by the player: "best", "worst", "mean", "median", "count", and averages of
 * any size, current ("ao50"), best ("ao50:best") or worst ("ao50:worst").
 */
export const DEFAULT_FIGURES = ["best", "worst", "mean", "ao5:best", "ao12", "ao12:best"];
export const FIGURE_LIMIT = 12;
/** Averages from 3 (a mean of three trimmed to one) to 1000 times. */
export const AVERAGE_SIZES = { min: 3, max: 1000 };
const SINGLES: Record<string, [string, Tone]> = {
  best: ["Best", "good"], worst: ["Worst", "bad"], mean: ["Mean", ""], median: ["Median", ""], count: ["Solves", ""],
};
export type Figure = { id: string; size?: number; which?: "current" | "best" | "worst" };
export function parseFigure(id: string): Figure | null {
  if (SINGLES[id]) return { id };
  const m = /^ao(\d+)(?::(best|worst))?$/.exec(id);
  const size = Number(m?.[1]);
  if (!m || size < AVERAGE_SIZES.min || size > AVERAGE_SIZES.max) return null;
  return { id, size, which: (m[2] as "best" | "worst" | undefined) ?? "current" };
}
export const averageFigure = (size: number, which: "current" | "best" | "worst") => `ao${size}${which === "current" ? "" : ":" + which}`;
export function figureLabel(id: string) {
  const figure = parseFigure(id);
  if (!figure) return id;
  if (!figure.size) return SINGLES[id]![0];
  return `${figure.which === "best" ? "Best " : figure.which === "worst" ? "Worst " : ""}Ao${figure.size}`;
}
/** The chosen figures, valid and once each, at most `FIGURE_LIMIT`. */
export const cleanFigures = (ids: unknown): string[] =>
  Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === "string" && !!parseFigure(id)))].slice(0, FIGURE_LIMIT) : DEFAULT_FIGURES;
const fmtFigure = (value: number | null) => (value === Infinity ? "DNF" : fmtTime(value));

/** The chosen figures of a session, in order: best ones in green, worst ones in red, current averages in the accent. */
export function sessionFigures(solves: readonly { time_ms: number; penalty: Penalty }[], ids: readonly string[]): Metric[] {
  const times = practiceSummary(solves).times;
  return ids.flatMap((id): Metric[] => {
    const figure = parseFigure(id);
    if (!figure) return [];
    const label = figureLabel(id);
    if (!figure.size) {
      if (id === "count") return [[label, String(times.length), ""]];
      const value = id === "best" ? best(times) : id === "mean" ? mean(times) : id === "median" ? median(times)
        : !times.length ? null : times.includes(null) ? Infinity : Math.max(...(times as number[]));
      return [[label, fmtFigure(value), SINGLES[id]![1]]];
    }
    const { size, which } = figure;
    if (which === "best") return [[label, fmtFigure(bestAverage(times, size)), "good"]];
    if (which === "worst") return [[label, fmtFigure(worstAverage(times, size)), "bad"]];
    const current = times.length >= size ? rollingAverages(times.slice(-size), size).at(-1) ?? Infinity : null;
    return [[label, fmtFigure(current), "accent"]];
  });
}

/** The records of a selection of timer solves (a profile's summary): best single, averages, mean and the count. */
export function timerFigures(summary: {
  best: number | null; bestAo5: number | null; bestAo12: number | null; ao5: number | null; ao12: number | null; mean: number | null; count: number;
}): Metric[] {
  return [
    ["Best single", fmtTime(summary.best), "good"],
    ["Best Ao5", fmtTime(summary.bestAo5), ""],
    ["Best Ao12", fmtTime(summary.bestAo12), ""],
    ["Current Ao5", fmtTime(summary.ao5), "accent"],
    ["Current Ao12", fmtTime(summary.ao12), "accent"],
    ["Mean", fmtTime(summary.mean), ""],
    ["Solves", summary.count.toLocaleString(), ""],
  ];
}

/** The session's fastest and slowest solves (a DNF is the slowest), once there are two. */
export function sessionExtremes(solves: readonly { id: number; time_ms: number; penalty: Penalty }[]): { best?: number; worst?: number } {
  if (solves.length < 2) return {};
  const ranked = [...solves].sort((a, b) => (effective(a.time_ms, a.penalty) ?? Infinity) - (effective(b.time_ms, b.penalty) ?? Infinity));
  return { best: ranked[0]!.id, worst: ranked.at(-1)!.id };
}

/** How a time of the session list is tinted: the slowest (or a DNF) bad, the fastest good, a +2 warned. */
export const solveTone = (v: { id: number; penalty: Penalty }, extremes: { best?: number; worst?: number }): Tone =>
  v.penalty === "dnf" || v.id === extremes.worst ? "bad" : v.id === extremes.best ? "good" : v.penalty === "+2" ? "warning" : "";
