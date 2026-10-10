import type { Penalty } from "../../shared/types";
import { averageOf, best, bestAverage, effective, fmtTime, mean, median, rollingAverages, worstAverage } from "./format";
import type { Tone } from "./tone";
import { msg } from "../i18n/msg";

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
    [msg("Best"), fmtTime(summary.best), "good"],
    [msg("Worst"), worst, "bad"],
    [msg("Mean"), fmtTime(summary.mean), ""],
    ["Ao5", fmtTime(summary.ao5), "accent"],
    [msg("Best Ao5"), fmtTime(bestAverage(times, 5)), "good"],
    ["Ao12", fmtTime(summary.ao12), "accent"],
    [msg("Best Ao12"), fmtTime(bestAverage(times, 12)), "good"],
    [msg("Solves"), String(summary.count), ""],
  ];
}

/**
 * The figures the timer's band shows, chosen by the player: "best", "worst", "mean", "median", "count", and averages of
 * any size, current ("ao50"), best ("ao50:best") or worst ("ao50:worst").
 */
export const DEFAULT_FIGURES = ["best", "ao5", "ao12", "mean"];
export const FIGURE_LIMIT = 8;
/** The band's rows, by the number of tiles in each: up to 5 figures on one line, beyond that two lines, the first the
 * longer (7 make 4 + 3). The editor's "Add" tile (`extra`) goes in those lines and never makes one of its own. */
export function figureRows(count: number, extra = 0) {
  const tiles = count + extra;
  if (count <= 5) return tiles ? [tiles] : [];
  return [Math.ceil(tiles / 2), Math.floor(tiles / 2)];
}
/** Averages from 3 (a mean of three trimmed to one) to 1000 times. */
export const AVERAGE_SIZES = { min: 3, max: 1000 };
const SINGLES: Record<string, [string, Tone]> = {
  best: [msg("Best"), "good"], worst: [msg("Worst"), "bad"], mean: [msg("Mean"), ""], median: [msg("Median"), ""], count: [msg("Solves"), ""],
  memo: [msg("Memo"), ""],
};
/** Blindfolded: the mean memorisation of the solves that have one (solves saved before it was kept have none). */
export const memoMean = (solves: readonly { memo_ms?: number | null }[]) =>
  mean(solves.flatMap((v) => (v.memo_ms == null ? [] : [v.memo_ms])));
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
export function sessionFigures(solves: readonly { time_ms: number; penalty: Penalty; memo_ms?: number | null }[], ids: readonly string[]): Metric[] {
  const times = practiceSummary(solves).times;
  return ids.flatMap((id): Metric[] => {
    const figure = parseFigure(id);
    if (!figure) return [];
    const label = figureLabel(id);
    if (!figure.size) {
      if (id === "count") return [[label, String(times.length), ""]];
      if (id === "memo") return [[label, fmtTime(memoMean(solves)), ""]];
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
  memo?: number | null;
}): Metric[] {
  return [
    // Blindfolded solves with a memorisation lead with its mean.
    ...(summary.memo != null ? [[msg("Mean memo"), fmtTime(summary.memo), ""] as Metric] : []),
    [msg("Best single"), fmtTime(summary.best), "good"],
    [msg("Best Ao5"), fmtTime(summary.bestAo5), ""],
    [msg("Best Ao12"), fmtTime(summary.bestAo12), ""],
    [msg("Current Ao5"), fmtTime(summary.ao5), "accent"],
    [msg("Current Ao12"), fmtTime(summary.ao12), "accent"],
    [msg("Mean"), fmtTime(summary.mean), ""],
    [msg("Solves"), summary.count.toLocaleString(), ""],
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

/** A solve of a timer history (`lib/local/stats`), oldest first. */
type Timed = { time: number | null; at: string; memoMs?: number | null };
/** One line of the stats table: the figure over the period shown, its latest value and its record (with when). */
export type PeriodFigure = { id: "memo" | "success" | "single" | "ao5" | "ao12" | "ao100" | "mean" | "count" | "dnf"; period: number | null; current: number | null; record: number | null; at?: string };

const minAt = (series: readonly (number | null)[], from: number, to: number) => {
  let low: number | null = null;
  for (let i = from; i <= to; i++) { const v = series[i]; if (v != null && (low == null || v < low)) low = v; }
  return low;
};
const indexOfMin = (series: readonly (number | null)[]) => {
  let at = -1;
  series.forEach((v, i) => { if (v != null && (at < 0 || v < series[at]!)) at = i; });
  return at;
};

/**
 * The stats table of a timer history over the solves [a, b]: the best single and averages of the period (an average
 * counts once it ends inside it), the latest ones, the records and the day each was set; the mean, the count and the
 * DNFs of the period against every solve; blindfolded, the memorisation and the success rate first.
 */
export function periodFigures(history: readonly Timed[], averages: Record<5 | 12 | 100, readonly (number | null)[]>, [a, b]: [number, number]): PeriodFigure[] {
  const times = history.map((v) => v.time), shown = times.slice(a, b + 1), last = history.length - 1;
  const memos = history.map((v) => v.memoMs ?? null), blind = memos.some((m) => m != null);
  const record = (series: readonly (number | null)[]) => { const i = indexOfMin(series); return { record: i < 0 ? null : series[i]!, at: history[i]?.at }; };
  const dnf = (list: readonly (number | null)[]) => list.filter((t) => t == null).length;
  const rows: PeriodFigure[] = [];
  if (blind) {
    rows.push({ id: "memo", period: mean(memos.slice(a, b + 1)), current: memos[last] ?? null, ...record(memos) });
    rows.push({ id: "success", period: shown.length ? 1 - dnf(shown) / shown.length : null, current: null, record: times.length ? 1 - dnf(times) / times.length : null });
  }
  rows.push({ id: "single", period: minAt(times, a, b), current: times[last] ?? null, ...record(times) });
  for (const size of [5, 12, 100] as const)
    if (size < 100 || times.length >= 100) rows.push({ id: `ao${size}`, period: minAt(averages[size], a, b), current: averages[size][last] ?? null, ...record(averages[size]) });
  rows.push({ id: "mean", period: mean(shown), current: null, record: mean(times) });
  rows.push({ id: "count", period: shown.length, current: null, record: times.length });
  rows.push({ id: "dnf", period: dnf(shown), current: null, record: dnf(times) });
  return rows;
}

/** Each time the best single was beaten, newest first: the solve, its time and how much it took off the one before. */
export function singleRecords(history: readonly Timed[]) {
  const out: { index: number; time: number; at: string; gain: number | null }[] = [];
  let low: number | null = null;
  history.forEach((v, index) => {
    if (v.time == null || (low != null && v.time >= low)) return;
    out.push({ index, time: v.time, at: v.at, gain: low == null ? null : low - v.time });
    low = v.time;
  });
  return out.reverse();
}
