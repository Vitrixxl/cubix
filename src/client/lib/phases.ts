/**
 * A solve timed in phases without a smart cube, as csTimer and CubeTime do: while the timer runs, each press ends a
 * phase, the last one stops the timer. A solve keeps its splits: the end of each phase but the last, in milliseconds
 * from the start (the last ends at its time). On the web and the phone.
 */
import { msg } from "../i18n/msg";
import type { PhaseSpan } from "./solveAnalysis";
import type { Penalty } from "../../shared/types";
import { averageOf, mean } from "./format";

export const MAX_PHASES = 8;
const PRESETS: Record<string, string[]> = { cfop: [msg("Cross"), "F2L", "OLL", "PLL"], roux: ["FB", "SB", "CMLL", "LSE"], zz: ["EOLine", "F2L", "LL"] };
/** The timer's phases setting: none, a method's steps, or a number of them. */
export const PHASE_OPTIONS: { id: string; label: string }[] = [
  { id: "off", label: msg("None") },
  { id: "cfop", label: "CFOP" },
  { id: "roux", label: "Roux" },
  { id: "zz", label: "ZZ" },
  ...Array.from({ length: MAX_PHASES - 1 }, (_, i) => ({ id: String(i + 2), label: msg("{0} phases", { 0: i + 2 }) })),
];

/** How many phases a solve has under the setting: 1 when it is off (or unknown). */
export function phaseCount(phases: string) {
  const n = PRESETS[phases]?.length ?? Number(phases);
  return Number.isInteger(n) && n >= 2 && n <= MAX_PHASES ? n : 1;
}

/** The names of `count` phases: the setting's when it has as many, numbered otherwise. */
export const phaseNames = (phases: string, count: number) =>
  PRESETS[phases]?.length === count ? PRESETS[phases]! : Array.from({ length: count }, (_, i) => msg("Phase {0}", { 0: i + 1 }));

/** Splits worth keeping with a solve of `timeMs`: rising, within the solve, fewer than `MAX_PHASES`; none otherwise. */
export function cleanSplits(splits: unknown, timeMs: number): number[] | undefined {
  if (!Array.isArray(splits) || !splits.length || splits.length >= MAX_PHASES) return undefined;
  let last = 0;
  for (const split of splits) {
    if (typeof split !== "number" || !(split > last) || !(split < timeMs)) return undefined;
    last = split;
  }
  return splits.map(Math.round);
}

/** Each phase's time, from a solve's splits and time. */
export const phaseTimes = (splits: readonly number[], timeMs: number) => [...splits, timeMs].map((end, i) => end - (i ? splits[i - 1]! : 0));

/** The bar's colours spread over the phases, as a smart cube solve's steps: the first lilac, the last in the accent. */
const COLOURED = ["cross", "f2l1", "f2l2", "f2l3", "f2l4", "oll", "cmll", "pll"] as const;

/** A split solve's phases, as the bar of a smart cube solve's steps draws them. */
export function phaseSpans(splits: readonly number[], timeMs: number, phases: string): PhaseSpan[] {
  const ends = [...splits, timeMs], names = phaseNames(phases, ends.length);
  return ends.map((end, i) => ({
    id: COLOURED[Math.round((i * (COLOURED.length - 1)) / Math.max(ends.length - 1, 1))]!,
    label: names[i]!,
    start: i ? ends[i - 1]! : 0,
    end,
    skip: false,
  }));
}

type Split = { time_ms: number; penalty: Penalty; splits?: number[] | null };

/**
 * The mean of each phase over the session's solves split as its latest one (DNFs left out), and its average of the
 * last 12 (best and worst dropped); null without a split solve.
 */
export function phaseMeans(solves: readonly Split[], phases: string) {
  const count = (solves.findLast((v) => v.splits?.length)?.splits?.length ?? 0) + 1;
  if (count < 2) return null;
  const times = solves.filter((v) => v.penalty !== "dnf" && v.splits?.length === count - 1).map((v) => phaseTimes(v.splits!, v.time_ms));
  return phaseNames(phases, count).map((label, i) => {
    const column = times.map((t) => t[i]!);
    return { label, mean: mean(column), ao12: column.length >= 12 ? averageOf(column.slice(-12)) : null };
  });
}
