import type { CaseHistoryDto, SolveDto, ProfileDto, UserDto } from "../../shared/types";
import { effective, averageOf, best, mean } from "../lib/format";
import { cases } from "./catalog";

export const chronological = (a: SolveDto, b: SolveDto) => a.created_at.localeCompare(b.created_at) || ((a as SolveDto & {serverId?:number}).serverId ?? a.id) - ((b as SolveDto & {serverId?:number}).serverId ?? b.id);
export function history(caseId: string, rows: SolveDto[]): CaseHistoryDto {
  const solves = [...rows].sort(chronological);
  const times = solves.map(s => effective(s.time_ms, s.penalty));
  const rolling = (size: number) => times.map((_, i) => i + 1 < size ? null : averageOf(times.slice(i + 1 - size, i + 1)));
  const ao5 = rolling(5), ao12 = rolling(12);
  const valid = times.filter((n): n is number => n !== null);
  let minimum: number | null = null;
  return { summary: { caseId, count: solves.length, best: best(times), worst: valid.reduce<number | null>((max,n) => max === null ? n : Math.max(max,n), null),
    mean: mean(times), ao5: ao5.at(-1) ?? null, ao12: ao12.at(-1) ?? null, bestAo5: best(ao5), bestAo12: best(ao12), last: times.at(-1) ?? null, lastAt: solves.at(-1)?.created_at ?? null },
    history: solves.map((s,i) => { const time = times[i]; if (time !== null) minimum = minimum === null ? time : Math.min(minimum,time);
      return { id:s.id, time, penalty:s.penalty, at:s.created_at, best:minimum, sessionId:s.session_id }; }), ao5, ao12 };
}
export function profile(user: UserDto, solves: SolveDto[]): ProfileDto {
  const groups = new Map<string, SolveDto[]>();
  for (const solve of [...solves].sort(chronological)) if (solve.case_id) { const rows = groups.get(solve.case_id) ?? []; rows.push(solve); groups.set(solve.case_id,rows); }
  const playground = solves.filter(s => !s.case_id);
  return { user, totalSolves: solves.length, trainingSolves: solves.length - playground.length,
    activeDays: new Set(solves.map(s => s.created_at.slice(0,10))).size,
    playground: history("playground",playground), cases: [...groups].flatMap(([id, rows]) => {
      const c = cases.find(c => c.id === id); return c ? [{ ...history(id,rows), name:c.name, stage:c.stage }] : [];
    }) };
}
