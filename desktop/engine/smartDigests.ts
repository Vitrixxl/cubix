/**
 * The digests of the 3×3 timer solves recorded on a smart cube (smartStats.ts), kept on the device so each solve is
 * analysed once. Analysing a solve takes a few milliseconds: a request analyses what its budget allows and the rest is
 * analysed between requests, the tabs told when more is ready (`changed`).
 */
import { analyseSolve, type CatalogCase } from '../../src/client/lib/solveAnalysis';
import { readSolution, recordedSolve } from '../../src/client/lib/solution';
import { caseTimes, digest, smartAnalysis, type SolveDigest } from '../../src/client/lib/smartStats';
import { effective } from '../../src/client/lib/format';
import { caseStats, history } from '../../src/client/local/stats';
import { solveModeOf, type SolveMode } from '../../src/shared/puzzles';
import type { CaseHistoryDto, CaseStatsDto, SolveDto } from '../../src/shared/types';
import type { EngineStorage } from './core';

export const SMART_DIGESTS_KEY = 'cubix.smart.digests.v2';
/** What one request may spend analysing solves, in milliseconds. */
const BUDGET = 40;

type Entry = { solution: string; mode: SolveMode; digest: SolveDigest | null };
export type { CaseSource } from '../../src/client/lib/smartStats';
import type { CaseSource } from '../../src/client/lib/smartStats';

export function createSmartDigests({ storage, cases, changed }: { storage: EngineStorage; cases: CatalogCase[]; changed: () => void }) {
  let entries: Map<number, Entry> | undefined;
  const load = () => (entries ??= new Map(Object.entries<Entry>(JSON.parse(storage.getItem(SMART_DIGESTS_KEY) ?? '{}')).map(([id, e]) => [Number(id), e])));
  /** Grows whenever a digest is added, changed or dropped: figures worked out from them are kept until it grows. */
  let version = 0;
  let saving: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    clearTimeout(saving);
    saving = setTimeout(() => storage.setItem(SMART_DIGESTS_KEY, JSON.stringify(Object.fromEntries(load()))), 2000);
  };
  /** Solves waiting for their analysis. */
  let queue: SolveDto[] = [];
  let working: ReturnType<typeof setTimeout> | undefined;

  function analyse(solve: SolveDto) {
    const turns = readSolution(solve.solution),
      recording = turns && recordedSolve(solve.scramble, turns);
    let result: SolveDigest | null = null;
    try {
      const analysis = recording ? analyseSolve(recording, cases) : null;
      if (analysis) result = digest(analysis, { id: solve.id, created_at: solve.created_at, time: effective(solve.time_ms, solve.penalty) });
    } catch { /* A solution the analysis cannot follow has no digest. */ }
    load().set(solve.id, { solution: solve.solution!, mode: solveModeOf(solve), digest: result });
  }
  /** Analyses waiting solves for `budget` milliseconds; true when some were. */
  function work(budget: number) {
    const until = performance.now() + budget;
    let done = 0;
    while (queue.length && performance.now() < until) { analyse(queue.shift()!); done++; }
    if (done) { version++; save(); }
    return done > 0;
  }
  /** The tabs hear of new digests once every solve is analysed, and every second or so until then. */
  let told = 0;
  function later() {
    if (working || !queue.length) return;
    working = setTimeout(() => {
      working = undefined;
      if (work(BUDGET) && (!queue.length || performance.now() - told > 1500)) {
        told = performance.now();
        changed();
      }
      later();
    }, 30);
  }

  /** The digests of these timer solves of one solve mode (every one of them, so deleted solves are dropped). */
  function read(solves: SolveDto[], mode: SolveMode): SolveDigest[] {
    const map = load(), present = new Set<number>(), waiting = new Set(queue.map(s => s.id));
    for (const solve of solves) {
      if (!solve.solution || solve.case_id) continue;
      present.add(solve.id);
      const entry = map.get(solve.id);
      if (entry?.solution !== solve.solution) { if (!waiting.has(solve.id)) queue.push(solve); continue; }
      // A penalty changed since: the digest follows it.
      const time = effective(solve.time_ms, solve.penalty);
      if (entry.digest && entry.digest.time !== time) { entry.digest.time = time; version++; save(); }
    }
    for (const [id, entry] of map) if (entry.mode === mode && !present.has(id)) { map.delete(id); version++; save(); }
    queue = queue.filter(s => present.has(s.id) || solveModeOf(s) !== mode);
    work(BUDGET);
    later();
    return [...map.values()].flatMap(e => (e.mode === mode && e.digest ? [e.digest] : []));
  }

  /** Figures worked out from the digests, kept while neither they nor `inputs` change. */
  const memo = new Map<string, { version: number; inputs: unknown[]; value: unknown }>();
  function kept<T>(key: string, inputs: unknown[], make: () => T): T {
    const hit = memo.get(key);
    if (hit && hit.version === version && hit.inputs.length === inputs.length && hit.inputs.every((v, i) => v === inputs[i])) return hit.value as T;
    const value = make();
    memo.set(key, { version, inputs, value });
    return value;
  }

  /** In-solve attempts of each case, as solves of that case, numbered below zero: they are not solves of their own. */
  const attempts = (digests: SolveDigest[], mode: SolveMode) => kept('attempts:' + mode, [], () => {
    const out = new Map<string, (SolveDto & { solveId: number })[]>();
    for (const [caseId, list] of caseTimes(digests))
      out.set(caseId, list.map((a, i) => ({ id: -(i + 1), solveId: a.solveId, case_id: caseId, time_ms: a.time, penalty: 'none' as const, scramble: null, session_id: null, created_at: a.at, puzzle_id: '333' as const, solve_mode: mode, scramble_type: 'case' as const })));
    return out;
  });

  return {
    /** The digests of these timer solves of one solve mode, analysing what the budget allows (see `read`). */
    digests: read,
    /** Every figure of the analysis page. */
    analysis: (digests: SolveDigest[], mode: SolveMode) => ({ ...kept('analysis:' + mode, [], () => smartAnalysis(digests)), pending: queue.length }),
    /**
     * A case's history from the solves it was done in, or (`all`) with its training too, from `trainingRows`. The
     * solves' attempts are marked with the solve they belong to.
     */
    caseHistory(caseId: string, source: Exclude<CaseSource, 'training'>, digests: SolveDigest[], trainingRows: SolveDto[], training: CaseHistoryDto, mode: SolveMode): CaseHistoryDto {
      return kept(`case:${caseId}:${source}:${mode}`, [training], () => {
        const inSolves = attempts(digests, mode).get(caseId) ?? [];
        return history(caseId, source === 'solves' ? inSolves : [...trainingRows.filter(s => s.case_id === caseId), ...inSolves]);
      });
    },
    /** Every case's summary from the solves, or (`all`) with the training's too, from `trainingRows`. */
    caseStats(source: Exclude<CaseSource, 'training'>, digests: SolveDigest[], trainingRows: SolveDto[], training: CaseStatsDto[], mode: SolveMode): CaseStatsDto[] {
      return kept(`stats:${source}:${mode}`, [training], () => {
        const inSolves = [...attempts(digests, mode).values()].flat();
        return caseStats(source === 'solves' ? inSolves : [...trainingRows, ...inSolves], '333', { solveMode: mode });
      });
    },
  };
}
