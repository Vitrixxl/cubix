import type { SolveDto } from "../../shared/types";
import { rollingAverages, solveResult } from "./format";
import { msg } from "../i18n/msg";

/**
 * A solve beats a personal best when its single, or the average of 5 or 12 it closes, is strictly
 * faster than every earlier one. The first single or average sets the record without beating any.
 */
export type RecordKind = "single" | "ao5" | "ao12";

/** `times` are the effective times of one practice context in chronological order, the judged solve last. */
export function beatenRecords(times: readonly (number | null)[]): RecordKind[] {
  // The last value against the best of those before it, read in place.
  const beats = (values: readonly (number | null)[]) => {
    let previous: number | null = null;
    for (let i = 0; i < values.length - 1; i++) { const value = values[i] ?? null; if (value !== null && (previous === null || value < previous)) previous = value; }
    const current = values.at(-1) ?? null;
    return current !== null && previous !== null && current < previous;
  };
  const out: RecordKind[] = [];
  if (beats(times)) out.push("single");
  if (beats(rollingAverages(times, 5))) out.push("ao5");
  if (beats(rollingAverages(times, 12))) out.push("ao12");
  return out;
}

/** The records beaten by `solveId` among every solve of its context, oldest first; later solves are ignored. */
export function solveRecords(solves: readonly SolveDto[], solveId: number): RecordKind[] {
  // The judged solve is usually the latest: looked for from the end.
  const index = solves.findLastIndex(solve => solve.id === solveId);
  return index < 0 ? [] : beatenRecords(Array.from({ length: index + 1 }, (_, i) => solveResult(solves[i]!)));
}

const LABELS: Record<RecordKind, string> = { single: "single", ao5: "Ao5", ao12: "Ao12" };

/** "New personal best: single and Ao5!", or null when nothing was beaten. */
export function recordMessage(kinds: readonly RecordKind[]): string | null {
  if (!kinds.length) return null;
  const labels = kinds.map(kind => LABELS[kind]);
  return msg("New personal best: {0}!", { 0: labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0] });
}
