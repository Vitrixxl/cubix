import type { Penalty } from "../../shared/types";
import { averageOf, best, bestAverage, fmtResult, fmtTime, mean, median, rollingAverages, solveResult, worst, worstAverage, type Solved } from "./format";
import { attemptMode } from "../../shared/puzzles";
import type { Tone } from "./tone";
import { msg } from "../i18n/msg";

/** Solves must be oldest first; rolling averages include DNF attempts. */
export function practiceSummary(solves: readonly Solved[]) {
  const times = solves.map(solveResult);
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
export function sessionMetrics(solves: readonly Solved[], mode = solves[0]?.solve_mode): Metric[] {
  if (attemptMode(mode)) return sessionFigures(solves, shownFigures(mode, []), mode);
  const summary = practiceSummary(solves), times = summary.times;
  return [
    [msg("Best"), fmtTime(summary.best), "good"],
    [msg("Worst"), times.includes(null) ? "DNF" : fmtTime(worst(times)), "bad"],
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
/** Fewest Moves and Multi-Blind show their own figures whatever the timer's: a mean of 3 is Fewest Moves' WCA average. */
export const shownFigures = (mode: string | undefined, ids: readonly string[]) =>
  mode === "fewest-moves" ? ["best", "mo3", "mo3:best", "mean", "count"] : mode === "multi-blind" ? ["best", "count"] : ids;
/** The means of 3 ending at each result, null for the first two; Infinity when one of the three is a DNF. */
function meansOf3(times: readonly (number | null)[]) {
  return times.map((_, i) => {
    const three = times.slice(i - 2, i + 1);
    return i < 2 ? null : three.includes(null) ? Infinity : (three as number[]).reduce((a, b) => a + b) / 3;
  });
}

/**
 * The chosen figures of a session, in order: best ones in green, worst ones in red, current averages in the accent.
 * `mode`: the session's solve mode, whose results the figures read as (`fmtResult`).
 */
export function sessionFigures(solves: readonly (Solved & { memo_ms?: number | null })[], ids: readonly string[], mode = solves[0]?.solve_mode): Metric[] {
  const times = practiceSummary(solves).times,
    fmtFigure = (value: number | null, single = false) => (value === Infinity ? "DNF" : fmtResult(value, mode, single));
  return ids.flatMap((id): Metric[] => {
    if (id === "mo3" || id === "mo3:best") {
      const means = meansOf3(times);
      return [id === "mo3" ? ["Mo3", fmtFigure(means.at(-1) ?? null), "accent"] : [msg("Best Mo3"), fmtFigure(best(means)), "good"]];
    }
    const figure = parseFigure(id);
    if (!figure) return [];
    const label = figureLabel(id);
    if (!figure.size) {
      if (id === "count") return [[label, String(times.length), ""]];
      if (id === "memo") return [[label, fmtTime(memoMean(solves)), ""]];
      const value = id === "best" ? best(times) : id === "mean" ? mean(times) : id === "median" ? median(times)
        : times.includes(null) ? Infinity : worst(times);
      return [[label, fmtFigure(value, id !== "mean" && id !== "median"), SINGLES[id]![1]]];
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
}, mode?: string): Metric[] {
  // Fewest Moves and Multi-Blind read as their results (`fmtResult`), a mean as one.
  const fmtTime = (value: number | null | undefined, single = false) => fmtResult(value, mode, single);
  return [
    // Blindfolded solves with a memorisation lead with its mean.
    ...(summary.memo != null ? [[msg("Mean memo"), fmtTime(summary.memo), ""] as Metric] : []),
    [msg("Best single"), fmtTime(summary.best, true), "good"],
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
  // One pass: the first of the fastest, the last of the slowest.
  let fastest = solves[0]!, slowest = fastest, low = Infinity, high = -Infinity;
  for (const v of solves) {
    const t = solveResult(v) ?? Infinity;
    if (t < low) { low = t; fastest = v; }
    if (t >= high) { high = t; slowest = v; }
  }
  return { best: fastest.id, worst: slowest.id };
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

const dnfCount = (list: readonly (number | null)[]) => list.filter((t) => t == null).length;
type Averages = Record<5 | 12 | 100, readonly (number | null)[]>;

/** What `periodFigures` reads from every solve, whatever the period: worth memoizing with the history and its averages. */
export function historyRecords(history: readonly Timed[], averages: Averages) {
  const times = history.map((v) => v.time), memos = history.map((v) => v.memoMs ?? null);
  const record = (series: readonly (number | null)[]) => { const i = indexOfMin(series); return { record: i < 0 ? null : series[i]!, at: history[i]?.at }; };
  return {
    times, memos, blind: memos.some((m) => m != null), mean: mean(times), dnf: dnfCount(times),
    memo: record(memos), single: record(times), ao5: record(averages[5]), ao12: record(averages[12]), ao100: record(averages[100]),
  };
}

/**
 * The stats table of a timer history over the solves [a, b]: the best single and averages of the period (an average
 * counts once it ends inside it), the latest ones, the records and the day each was set; the mean, the count and the
 * DNFs of the period against every solve; blindfolded, the memorisation and the success rate first.
 */
export function periodFigures(history: readonly Timed[], averages: Averages, [a, b]: [number, number], all = historyRecords(history, averages)): PeriodFigure[] {
  const { times, memos } = all, shown = times.slice(a, b + 1), last = times.length - 1;
  const rows: PeriodFigure[] = [];
  if (all.blind) {
    rows.push({ id: "memo", period: mean(memos.slice(a, b + 1)), current: memos[last] ?? null, ...all.memo });
    rows.push({ id: "success", period: shown.length ? 1 - dnfCount(shown) / shown.length : null, current: null, record: times.length ? 1 - all.dnf / times.length : null });
  }
  rows.push({ id: "single", period: minAt(times, a, b), current: times[last] ?? null, ...all.single });
  for (const size of [5, 12, 100] as const)
    if (size < 100 || times.length >= 100) rows.push({ id: `ao${size}`, period: minAt(averages[size], a, b), current: averages[size][last] ?? null, ...all[`ao${size}`] });
  rows.push({ id: "mean", period: mean(shown), current: null, record: all.mean });
  rows.push({ id: "count", period: shown.length, current: null, record: times.length });
  rows.push({ id: "dnf", period: dnfCount(shown), current: null, record: all.dnf });
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

/** One figure of a period against the one before it: the mean, the median, the spread (standard deviation) or the DNF rate. */
export type SpreadFigure = { id: "mean" | "median" | "deviation" | "dnf"; now: number | null; before: number | null };
export const SPREAD_LABEL: Record<SpreadFigure["id"], string> = { mean: msg("Mean"), median: msg("Median"), deviation: msg("Deviation"), dnf: "DNF" };
/** A round bucket width: 1, 2 or 5 times a power of ten, the smallest giving at most `most` buckets over `span`. */
const roundWidth = (span: number, most: number) => {
  for (let unit = 1; ; unit *= 10) for (const step of [1, 2, 5]) if (span / (step * unit) <= most) return step * unit;
};
const deviation = (list: Float64Array) => {
  if (list.length < 2) return null;
  const m = list.reduce((a, b) => a + b, 0) / list.length;
  return Math.sqrt(list.reduce((a, b) => a + (b - m) ** 2, 0) / (list.length - 1));
};

/**
 * How the times of the solves [a, b] spread, beside as many solves just before them (fewer at the start): buckets of a
 * round width from `from`, the fastest and slowest 2 % folded into the first and last (`now[i]`, `before[i]` solves in
 * bucket i), and the figures of both.
 */
export function periodSpread(history: readonly Timed[], [a, b]: [number, number], most = 14) {
  const times = history.map((v) => v.time), now = times.slice(a, b + 1), before = times.slice(Math.max(0, a - now.length), a);
  // Each side's finished times sorted once (numerically, as a typed array), then merged for the percentiles of both.
  const done = (list: readonly (number | null)[]) => Float64Array.from(list.filter((t): t is number => t != null)).sort();
  const doneNow = done(now), doneBefore = done(before), finished = new Float64Array(doneNow.length + doneBefore.length);
  for (let i = 0, j = 0, k = 0; k < finished.length; k++)
    finished[k] = j >= doneBefore.length || (i < doneNow.length && doneNow[i]! <= doneBefore[j]!) ? doneNow[i++]! : doneBefore[j++]!;
  const low = finished[Math.floor(finished.length * 0.02)] ?? 0, high = finished[Math.ceil(finished.length * 0.98) - 1] ?? low;
  const width = roundWidth(Math.max(1, high - low), most - 1), from = Math.floor(low / width) * width;
  const count = Math.max(1, Math.floor((high - from) / width) + 1);
  const bucket = (list: Float64Array) => {
    const out = new Array<number>(count).fill(0);
    for (const t of list) out[Math.max(0, Math.min(count - 1, Math.floor((t - from) / width)))]!++;
    return out;
  };
  const middle = (s: Float64Array) => (!s.length ? null : s.length % 2 ? s[s.length >> 1]! : (s[(s.length >> 1) - 1]! + s[s.length >> 1]!) / 2);
  const figures = (list: (number | null)[], sorted: Float64Array) => ({ mean: mean(list), median: middle(sorted), deviation: deviation(sorted), dnf: list.length ? (list.length - sorted.length) / list.length : null });
  const n = figures(now, doneNow), p = before.length ? figures(before, doneBefore) : null;
  return {
    from, width, now: bucket(doneNow), before: bucket(doneBefore), beforeCount: before.length,
    figures: (["mean", "median", "deviation", "dnf"] as const).map((id): SpreadFigure => ({ id, now: n[id], before: p?.[id] ?? null })),
  };
}
