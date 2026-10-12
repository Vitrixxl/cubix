import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { effective } from "../../../../src/client/lib/format";
import { digest, smartAnalysis, type SmartAnalysisDto, type SolveDigest } from "../../../../src/client/lib/smartStats";
import type { SolveMode } from "../../../../src/shared/puzzles";
import type { SolveDto } from "../../../../src/shared/types";
import { api } from "../../api";
import { storage } from "../../platform/storage";
import { statsVersionAtom } from "../../state";
import { analyseSolution } from "./steps";

/**
 * The digests of the 3×3 timer solves turned on a smart cube (smartStats.ts), kept on the device so that each solve is
 * analysed once, as the web engine does (desktop/engine/smartDigests.ts). A solve takes a few milliseconds: they are
 * analysed in slices between frames, the page told how many are left.
 */
const KEY = "cubix.mobile.smartDigests.v1";
/** What one slice may spend analysing solves, in milliseconds. */
const BUDGET = 30;
type Entry = { solution: string; digest: SolveDigest | null };
let entries: Map<number, Entry> | undefined;
const load = () => {
  if (entries) return entries;
  try { entries = new Map(Object.entries<Entry>(JSON.parse(storage.getItem(KEY) ?? "{}")).map(([id, e]) => [Number(id), e])); }
  catch { entries = new Map(); }
  return entries;
};
let saving: ReturnType<typeof setTimeout> | undefined;
const save = () => {
  clearTimeout(saving);
  // Best effort: a full storage (the browser's quota) only costs analysing the solves again next time.
  saving = setTimeout(() => { try { storage.setItem(KEY, JSON.stringify(Object.fromEntries(load()))); } catch { /* Kept in memory. */ } }, 2000);
};

function analyse(solve: SolveDto) {
  const analysis = analyseSolution(solve.scramble, solve.solution);
  let result: SolveDigest | null = null;
  try { if (analysis) result = digest(analysis, { id: solve.id, created_at: solve.created_at, time: effective(solve.time_ms, solve.penalty) }); }
  catch { /* A solution the analysis cannot follow has no digest. */ }
  load().set(solve.id, { solution: solve.solution!, digest: result });
}

/** The analysis of the smart cube solves of a solve mode, worked out again whenever the solves change. */
export function useSmartAnalysis(mode: SolveMode) {
  const version = useAtomValue(statsVersionAtom);
  const [state, setState] = useState<{ analysis: SmartAnalysisDto | null; pending: number }>({ analysis: null, pending: 0 });
  useEffect(() => {
    let live = true, timer: ReturnType<typeof setTimeout> | undefined;
    void api.solves("playground", Infinity, "333", { solveMode: mode }).then(rows => {
      if (!live) return;
      const solves = rows.filter(s => s.solution && !s.case_id), map = load();
      const queue = solves.filter(s => map.get(s.id)?.solution !== s.solution);
      const publish = () => {
        const digests = solves.flatMap(s => {
          const d = map.get(s.id)?.digest;
          if (!d) return [];
          // A penalty changed since: the digest follows it.
          d.time = effective(s.time_ms, s.penalty);
          return [d];
        });
        setState({ analysis: smartAnalysis(digests), pending: queue.length });
      };
      const work = () => {
        const until = performance.now() + BUDGET;
        while (queue.length && performance.now() < until) analyse(queue.shift()!);
        save();
        if (!live) return;
        if (queue.length) { setState(s => ({ ...s, pending: queue.length })); timer = setTimeout(work, 16); }
        else publish();
      };
      if (queue.length) work(); else publish();
    }, () => { if (live) setState({ analysis: smartAnalysis([]), pending: 0 }); });
    return () => { live = false; clearTimeout(timer); };
  }, [mode, version]);
  return state;
}
