/**
 * What the training drills: only learned cases. A session gathers the recommended cases picked, whole sets (their
 * learned cases only) and cases picked by hand; the recommendations are the learned cases slower than the player's
 * usual time on their set, in training and in the smart cube solves.
 */
import { tr } from "../i18n";

/** A case as the training needs it: its id and its set. */
export interface PoolCase {
  id: string;
  set: string;
}
/** A case's training times (`CaseStatsDto`). */
export interface TrainedCase {
  caseId: string;
  count: number;
  mean: number | null;
  lastAt?: string | null;
}
/** A case's times inside the smart cube solves (`CaseStats` of smartStats.ts). */
export interface SolvedCase {
  id: string;
  count: number;
  duration: number;
  recognition: number;
}
export interface Recommendation {
  id: string;
  /** Where it is slow: in its training, or in the solves recorded on a smart cube. */
  source: "training" | "solves";
  /** Its mean time there, and the mean of the set's learned cases there (its usual). */
  time: number;
  usual: number;
  count: number;
  /** Solves: the mean pause before its first turn. */
  recognition?: number;
  /** Training: its last attempt. */
  lastAt?: string | null;
}

/** Attempts a case needs before its mean says anything. */
export const MIN_ATTEMPTS = 3;

/** The ids of the cases a session drills: learned ones only, in catalogue order. */
export function trainingPool(cases: readonly PoolCase[], learned: ReadonlySet<string>, { picks = [], sets = [], hand = [] }: { picks?: readonly string[]; sets?: readonly string[]; hand?: readonly string[] }): string[] {
  const chosen = new Set([...picks, ...hand]),
    whole = new Set(sets);
  return cases.filter((c) => learned.has(c.id) && (chosen.has(c.id) || whole.has(c.set))).map((c) => c.id);
}

/** Of each set, its learned cases timed enough that are slower than the set's usual (the mean of them all). */
function slower(rows: { id: string; set: string; time: number; count: number }[]) {
  const bySet = new Map<string, typeof rows>();
  for (const row of rows) bySet.set(row.set, [...(bySet.get(row.set) ?? []), row]);
  return [...bySet.values()].flatMap((list) => {
    // One case alone has no usual to be compared with.
    if (list.length < 2) return [];
    const usual = list.reduce((sum, row) => sum + row.time, 0) / list.length;
    return list.filter((row) => row.time > usual).map((row) => ({ ...row, usual }));
  });
}

/** The learned cases to train first, the slowest against their usual first; a case slow in both places keeps its worse one. */
export function recommend(cases: readonly PoolCase[], learned: ReadonlySet<string>, training: readonly TrainedCase[], solves: readonly SolvedCase[], limit = 8): Recommendation[] {
  const setOf = new Map(cases.map((c) => [c.id, c.set]));
  const known = (id: string, count: number) => learned.has(id) && setOf.has(id) && count >= MIN_ATTEMPTS;
  const trained = slower(training.filter((t) => t.mean != null && known(t.caseId, t.count)).map((t) => ({ id: t.caseId, set: setOf.get(t.caseId)!, time: t.mean!, count: t.count, lastAt: t.lastAt ?? null })));
  const solved = slower(solves.filter((c) => known(c.id, c.count)).map((c) => ({ id: c.id, set: setOf.get(c.id)!, time: c.duration, count: c.count, recognition: c.recognition })));
  const best = new Map<string, Recommendation>();
  for (const { set: _, ...r } of [...trained.map((r) => ({ ...r, source: "training" as const })), ...solved.map((r) => ({ ...r, source: "solves" as const }))]) {
    const held = best.get(r.id);
    if (!held || r.time / r.usual > held.time / held.usual) best.set(r.id, r);
  }
  return [...best.values()].sort((a, b) => b.time / b.usual - a.time / a.usual).slice(0, limit);
}

/** Why a case is recommended, in a few words. */
export function recommendedWhy(r: Recommendation) {
  const days = r.lastAt ? Math.floor((Date.now() - Date.parse(r.lastAt)) / 86_400_000) : 0;
  return r.source === "solves"
    ? tr("recognition {0} s", { 0: ((r.recognition ?? 0) / 1000).toFixed(2) })
    : days >= 14
      ? tr("not trained for {0} days", { 0: days })
      : tr("{0}% slower than usual", { 0: Math.round((r.time / r.usual - 1) * 100) });
}
