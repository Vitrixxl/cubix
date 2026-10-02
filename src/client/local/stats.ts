import { EVENTS, PUZZLES, matchesPractice, type PuzzleInput, type PracticeFilter } from "../../shared/puzzles";
import type { CaseHistoryDto, EventRecordDto, SolveDto, ProfileDto, UserDto } from "../../shared/types";
import { effective, best, bestAverage, mean, rollingAverages } from "../lib/format";
import { cases } from "./catalog";

export const chronological = (a: SolveDto, b: SolveDto) => a.created_at.localeCompare(b.created_at) || ((a as SolveDto & {serverId?:number}).serverId ?? a.id) - ((b as SolveDto & {serverId?:number}).serverId ?? b.id);
export function history(caseId: string, rows: SolveDto[]): CaseHistoryDto {
  const solves = [...rows].sort(chronological);
  const times = solves.map(s => effective(s.time_ms, s.penalty));
  const ao5 = rollingAverages(times, 5), ao12 = rollingAverages(times, 12);
  const valid = times.filter((n): n is number => n !== null);
  let minimum: number | null = null;
  return { summary: { caseId, count: solves.length, best: best(times), worst: valid.reduce<number | null>((max,n) => max === null ? n : Math.max(max,n), null),
    mean: mean(times), ao5: ao5.at(-1) ?? null, ao12: ao12.at(-1) ?? null, bestAo5: best(ao5), bestAo12: best(ao12), last: times.at(-1) ?? null, lastAt: solves.at(-1)?.created_at ?? null },
    history: solves.map((s,i) => { const time = times[i]; if (time !== null) minimum = minimum === null ? time : Math.min(minimum,time);
      return { id:s.id, time, timeMs:s.time_ms, penalty:s.penalty, comment:s.comment ?? null, at:s.created_at, best:minimum, sessionId:s.session_id }; }), ao5, ao12 };
}
export function profile(user: UserDto, rows: SolveDto[], cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}, bests: Partial<Record<string, number>> = {}): ProfileDto {
  const solves = rows.filter(s => matchesPractice(s, cubeSize, s.case_id ? {solveMode:filter.solveMode} : filter));
  const groups = new Map<string, SolveDto[]>();
  for (const solve of [...solves].sort(chronological)) if (solve.case_id) { const rows = groups.get(solve.case_id) ?? []; rows.push(solve); groups.set(solve.case_id,rows); }
  const playground = solves.filter(s => !s.case_id), timed = new Set(playground.map(s => s.id));
  return { user, totalSolves: solves.length, trainingSolves: solves.length - playground.length,
    activeDays: new Set(solves.map(s => s.created_at.slice(0,10))).size,
    playground: history("playground",playground), cases: [...groups].flatMap(([id, rows]) => {
      const c = cases.find(c => c.id === id); return c ? [{ ...history(id,rows), name:c.name, stage:c.stage }] : [];
    }),
    records: records(rows, bests),
    activity: rows.map(s => ({ at: s.created_at, time: timed.has(s.id) ? effective(s.time_ms, s.penalty) : null, timer: timed.has(s.id) })) };
}

/**
 * Each event's records on the timer with its puzzle's standard scrambles, in the events' order. The best single given
 * at setup (`bests`, by puzzle) stands until a solve beats it; events neither timed nor given are left out.
 */
export function records(rows: SolveDto[], bests: Partial<Record<string, number>> = {}): EventRecordDto[] {
  return EVENTS.flatMap(e => {
    const scrambleType = PUZZLES.find(p => p.id === e.puzzle)?.scrambles[0];
    const solves = rows.filter(s => !s.case_id && matchesPractice(s, e.puzzle, { solveMode: e.solveMode, scrambleType })).sort(chronological);
    const declared = e.solveMode === "standard" ? bests[e.puzzle] ?? null : null;
    if (!solves.length && declared === null) return [];
    const times = solves.map(s => effective(s.time_ms, s.penalty)), single = best(times);
    const given = declared !== null && (single === null || declared < single);
    return [{ event: e.id, puzzle: e.puzzle, solveMode: e.solveMode, count: solves.length, best: given ? declared : single,
      bestAo5: bestAverage(times, 5), bestAo12: bestAverage(times, 12), bestAo100: bestAverage(times, 100), lastAt: solves.at(-1)?.created_at ?? null, ...(given ? { declared: true } : {}) }];
  });
}
