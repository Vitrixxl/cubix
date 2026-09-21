import type { Penalty } from "../../shared/types";
import { averageOf, best, effective, mean } from "./format";

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
