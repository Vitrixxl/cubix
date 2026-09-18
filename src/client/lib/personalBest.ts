import type { SolveDto } from "../../shared/types";
import { averageOf, best, effective } from "./format";

/**
 * A solve beats a personal best when its single, or the average of 5 or 12 it closes, is strictly
 * faster than every earlier one. The first single or average sets the record without beating any.
 */
export type RecordKind = "single" | "ao5" | "ao12";

/** `times` are the effective times of one practice context in chronological order, the judged solve last. */
export function beatenRecords(times: readonly (number | null)[]): RecordKind[] {
  const rolling = (size: number) => times.map((_, i) => i + 1 < size ? null : averageOf(times.slice(i + 1 - size, i + 1)));
  const beats = (values: (number | null)[]) => {
    const current = values.at(-1) ?? null, previous = best(values.slice(0, -1));
    return current !== null && previous !== null && current < previous;
  };
  const out: RecordKind[] = [];
  if (beats([...times])) out.push("single");
  if (beats(rolling(5))) out.push("ao5");
  if (beats(rolling(12))) out.push("ao12");
  return out;
}

/** The records beaten by `solveId` among every solve of its context, oldest first; later solves are ignored. */
export function solveRecords(solves: readonly SolveDto[], solveId: number): RecordKind[] {
  const index = solves.findIndex(solve => solve.id === solveId);
  return index < 0 ? [] : beatenRecords(solves.slice(0, index + 1).map(solve => effective(solve.time_ms, solve.penalty)));
}

const LABELS: Record<RecordKind, string> = { single: "single", ao5: "Ao5", ao12: "Ao12" };

/** "New personal best: single and Ao5!", or null when nothing was beaten. */
export function recordMessage(kinds: readonly RecordKind[]): string | null {
  if (!kinds.length) return null;
  const labels = kinds.map(kind => LABELS[kind]);
  return `New personal best: ${labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0]}!`;
}
