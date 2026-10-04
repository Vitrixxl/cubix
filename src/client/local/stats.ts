import { EVENTS, PUZZLES, matchesPractice, puzzleOf, solveModeOf, scrambleTypeOf, type PuzzleInput, type PracticeFilter } from "../../shared/puzzles";
import type { CaseHistoryDto, EventRecordDto, SolveDto, ProfileDto, UserDto } from "../../shared/types";
import { effective, best, bestAverage, mean, rollingAverages } from "../lib/format";
import { cases } from "./catalog";

export const chronological = (a: SolveDto, b: SolveDto) => a.created_at.localeCompare(b.created_at) || ((a as SolveDto & {serverId?:number}).serverId ?? a.id) - ((b as SolveDto & {serverId?:number}).serverId ?? b.id);
const casesById = new Map(cases.map(c => [c.id, c]));
const defaultScrambles = new Map(PUZZLES.map(p => [p.id, p.scrambles[0]]));

function summary(caseId: string, solves: SolveDto[], times: (number | null)[], ao5: (number | null)[], ao12: (number | null)[]): CaseHistoryDto["summary"] {
  let worst: number | null = null;
  for (const time of times) if (time !== null) worst = worst === null ? time : Math.max(worst, time);
  return { caseId, count: solves.length, best: best(times), worst, mean: mean(times),
    ao5: ao5.at(-1) ?? null, ao12: ao12.at(-1) ?? null, bestAo5: best(ao5), bestAo12: best(ao12), last: times.at(-1) ?? null, lastAt: solves.at(-1)?.created_at ?? null };
}

function orderedHistory(caseId: string, solves: SolveDto[]): CaseHistoryDto {
  const times = solves.map(s => effective(s.time_ms, s.penalty));
  const ao5 = rollingAverages(times, 5), ao12 = rollingAverages(times, 12);
  let minimum: number | null = null;
  return { summary: summary(caseId, solves, times, ao5, ao12),
    history: solves.map((s,i) => { const time = times[i]; if (time !== null) minimum = minimum === null ? time : Math.min(minimum,time);
      return { id:s.id, time, timeMs:s.time_ms, penalty:s.penalty, comment:s.comment ?? null, at:s.created_at, best:minimum, sessionId:s.session_id }; }), ao5, ao12 };
}
export function history(caseId: string, rows: SolveDto[]): CaseHistoryDto {
  return orderedHistory(caseId, [...rows].sort(chronological));
}

function caseGroups(rows: SolveDto[]) {
  const groups = new Map<string, SolveDto[]>();
  for (const solve of rows) if (solve.case_id) {
    const group = groups.get(solve.case_id);
    if (group) group.push(solve); else groups.set(solve.case_id, [solve]);
  }
  return groups;
}

/** Training lists need summaries only, not the timer history, all-event records or activity graph. */
export function caseStats(rows: SolveDto[], puzzle: PuzzleInput = 3, filter: PracticeFilter = {}) {
  const selected = rows.filter(s => s.case_id && matchesPractice(s, puzzle, { solveMode: filter.solveMode })).sort(chronological);
  return [...caseGroups(selected)].flatMap(([id, solves]) => {
    if (!casesById.has(id)) return [];
    const times = solves.map(s => effective(s.time_ms, s.penalty));
    return [summary(id, solves, times, rollingAverages(times, 5), rollingAverages(times, 12))];
  });
}

export function profile(user: UserDto, rows: SolveDto[], cubeSize: PuzzleInput = 3, filter: PracticeFilter = {}, bests: Partial<Record<string, number>> = {}): ProfileDto {
  // Sort once for every history and record, retaining the input order of the activity feed.
  const ordered = [...rows].sort(chronological);
  const solves = ordered.filter(s => matchesPractice(s, cubeSize, s.case_id ? {solveMode:filter.solveMode} : filter));
  const groups = caseGroups(solves);
  const playground = solves.filter(s => !s.case_id), timed = new Set(playground.map(s => s.id));
  return { user, totalSolves: solves.length, trainingSolves: solves.length - playground.length,
    activeDays: new Set(solves.map(s => s.created_at.slice(0,10))).size,
    playground: orderedHistory("playground",playground), cases: [...groups].flatMap(([id, rows]) => {
      const c = casesById.get(id); return c ? [{ ...orderedHistory(id,rows), name:c.name, stage:c.stage }] : [];
    }),
    records: orderedRecords(ordered, bests),
    activity: rows.map(s => ({ at: s.created_at, time: timed.has(s.id) ? effective(s.time_ms, s.penalty) : null, timer: timed.has(s.id) })) };
}

/** Each event's timer records on its standard scrambles; a declared best stands until beaten. */
export function records(rows: SolveDto[], bests: Partial<Record<string, number>> = {}): EventRecordDto[] {
  return orderedRecords([...rows].sort(chronological), bests);
}
function orderedRecords(rows: SolveDto[], bests: Partial<Record<string, number>>): EventRecordDto[] {
  const groups = new Map<string, SolveDto[]>();
  for (const solve of rows) {
    if (solve.case_id || scrambleTypeOf(solve) !== defaultScrambles.get(puzzleOf(solve))) continue;
    const key = `${puzzleOf(solve)}:${solveModeOf(solve)}`, group = groups.get(key);
    if (group) group.push(solve); else groups.set(key, [solve]);
  }
  return EVENTS.flatMap(e => {
    const solves = groups.get(`${e.puzzle}:${e.solveMode}`) ?? [];
    const declared = e.solveMode === "standard" ? bests[e.puzzle] ?? null : null;
    if (!solves.length && declared === null) return [];
    const times = solves.map(s => effective(s.time_ms, s.penalty)), single = best(times);
    const given = declared !== null && (single === null || declared < single);
    return [{ event: e.id, puzzle: e.puzzle, solveMode: e.solveMode, count: solves.length, best: given ? declared : single,
      bestAo5: bestAverage(times, 5), bestAo12: bestAverage(times, 12), bestAo100: bestAverage(times, 100), lastAt: solves.at(-1)?.created_at ?? null, ...(given ? { declared: true } : {}) }];
  });
}
