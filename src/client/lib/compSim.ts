/**
 * A competition simulation ("Comp sim"), on the web and the phone: one WCA round of the timer's event, its attempts
 * saved as the solves of a session of its own. The round is computed the WCA way (regulation 9f).
 */
import type { RoundFormat } from "../../shared/puzzles";
import { msg } from "../i18n/msg";
import { averageOf, best, bestAverage, fmtTime, mean, shortDate } from "./format";

/** Five attempts for an average of 5, three otherwise. */
export const roundAttempts = (format: RoundFormat) => (format === "ao5" ? 5 : 3);

/** The name of the round's session, short enough for the times panel's heading: "Comp 15 Oct". */
export const compSimName = (at = new Date().toISOString()) => msg("Comp {0}", { 0: shortDate(at) });

/** A mean of 3: a DNF among them makes it one. */
const meanOf3 = (times: readonly (number | null)[]) => (times.includes(null) ? null : mean([...times]));

interface RoundResult {
  /** The average of 5 (best and worst dropped, two DNFs a DNF) or the mean of 3 (one DNF a DNF); null for a DNF. */
  average: number | null;
  best: number | null;
  /** What the round ranks by: the best single on a best of 3, the average otherwise. */
  result: number | null;
  /** An average of 5's best and worst attempts, shown in parentheses. */
  dropped: number[];
}

/** A round's figures from its attempts' effective times (null for a DNF), in order. */
export function roundResult(format: RoundFormat, times: readonly (number | null)[]): RoundResult {
  const average = format === "ao5" ? averageOf([...times]) : meanOf3(times),
    single = best([...times]),
    dropped: number[] = [];
  if (format === "ao5" && times.length > 1) {
    const rank = (i: number) => times[i] ?? Infinity;
    let low = 0, high = 1;
    for (let i = 1; i < times.length; i++) if (rank(i) < rank(low)) low = i;
    if (low === 1) high = 0;
    for (let i = 0; i < times.length; i++) if (i !== low && rank(i) >= rank(high)) high = i;
    dropped.push(low, high);
  }
  return { average, best: single, result: format === "bo3" ? single : average, dropped };
}

/** The attempts as WCA lists them: "(10.50) 12.01 13.22 (DNF) 11.80". */
export const attemptTexts = (times: readonly (number | null)[], dropped: readonly number[]) =>
  times.map((t, i) => (dropped.includes(i) ? `(${fmtTime(t, { blank: "DNF" })})` : fmtTime(t, { blank: "DNF" })));

/** The record a round is compared with, from the event's earlier times (oldest first): its best average of 5, mean of 3 or single. */
export function roundRecord(format: RoundFormat, times: readonly (number | null)[]): number | null {
  if (format === "ao5") return bestAverage(times, 5);
  if (format === "bo3") return best([...times]);
  let record: number | null = null;
  for (let i = 3; i <= times.length; i++) {
    const m = meanOf3(times.slice(i - 3, i));
    if (m !== null && (record === null || m < record)) record = m;
  }
  return record;
}

/** How a result stands against the record: "−0.440" faster, "+0.440" slower; null without both. */
export function versusRecord(result: number | null, record: number | null) {
  if (result === null || record === null) return null;
  const gap = result - record;
  return { faster: gap < 0, text: (gap < 0 ? "−" : "+") + fmtTime(Math.abs(gap)) };
}
