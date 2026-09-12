import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { solveModeAtom, puzzleAtom, cubeSwitchLockedAtom, casesAtom, deletedSolveIdAtom, hideAlgorithmAtom, randomAufAtom, routeAtom, selectedCaseIdsAtom, setsAtom, statsVersionAtom } from "../state";
import type { CaseDto, SolveDto } from "../../shared/types";
import { api } from "../api";
import { useTimer } from "../hooks/useTimer";
import { TimerSurface } from "../components/TimerSurface";
import { CaseSelector } from "../components/CaseSelector";
import { puzzleInfo } from "../../shared/puzzles";
import { CaseDiagram } from "../components/CaseDiagram";
import { executableAlg } from "../lib/caseState";
import { combineAuf, compensateAuf, randomAuf } from "../../shared/cube";
import { EMPTY_TRAINING_HISTORY, trainingHistoryReducer } from "../lib/trainingHistory";
import { best, effective, fmtSolve, fmtTime, mean } from "../lib/format";
import { AlgText } from "../components/AlgorithmList";
import { IconEye, IconSkip, IconUndo, IconGrid, IconTimer, IconBack } from "../components/icons";
import { PracticePanel, useWidePractice } from "../components/PracticePanel";
import { ShortcutKey } from "../components/ShortcutKey";
import { useShortcuts } from "../hooks/useShortcuts";
import { Kpi } from "../components/Kpi";

export function TrainingPage() {
  const puzzle = useAtomValue(puzzleAtom);
  const cube = puzzleInfo(puzzle).cubeSize;
  const supportsAuf = !!cube;
  const solveMode = useAtomValue(solveModeAtom);
  const lockCube = useSetAtom(cubeSwitchLockedAtom);
  const cases = useAtomValue(casesAtom);
  const sets = useAtomValue(setsAtom);
  const [selected, setSelected] = useAtom(selectedCaseIdsAtom);
  const [hideAlg, setHideAlg] = useAtom(hideAlgorithmAtom);
  const [useAuf, setUseAuf] = useAtom(randomAufAtom);
  const [route, setRoute] = useAtom(routeAtom);
  const bumpStats = useSetAtom(statsVersionAtom);

  const byId = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);
  const selectedCases = useMemo(() => selected.map((id) => byId.get(id)).filter((c): c is CaseDto => !!c), [selected, byId]);
  const [caseHistory, navigateCase] = useReducer(trainingHistoryReducer, EMPTY_TRAINING_HISTORY);
  const current = caseHistory.entries[caseHistory.index] ?? null;
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [solves, setSolves] = useState<SolveDto[]>([]);
  const deletedSolveId = useAtomValue(deletedSolveIdAtom);
  useEffect(() => { if (deletedSolveId !== null) setSolves(list => list.filter(solve => solve.id !== deletedSolveId)); }, [deletedSolveId]);
  const wide = useWidePractice();
  const [showSelector, setShowSelector] = useState(wide);
  const [showTimes, setShowTimes] = useState(wide);
  useEffect(() => { setShowSelector(wide); setShowTimes(wide); }, [wide]);
  const session = useRef<number | null>(null);
  useEffect(() => {
    let active = true;
    const restore = async () => {
      const latest = await api.latestSession("training", puzzle, {solveMode, scrambleType:"case"});
      if (!active || !latest) return;
      if (session.current === null) session.current = latest.id;
      const rows = await api.solves("training",1000, puzzle, {solveMode, scrambleType:"case"});
      if (active) setSolves(rows.filter(s => s.session_id === session.current).reverse());
    };
    void restore();
    window.addEventListener("cubix-local-changed",restore);
    return () => { active = false; window.removeEventListener("cubix-local-changed",restore); };
  },[]);

  const pick = useCallback(
    (pool: CaseDto[]) => {
      navigateCase({ type: "next", pool, sample: Math.random(), auf: useAuf && supportsAuf ? randomAuf() : "" });
      setRevealed(false);
    },
    [useAuf, supportsAuf],
  );

  // pick a case when the selection changes / on mount
  useEffect(() => {
    if (!current || !selected.includes(current.c.id)) pick(selectedCases);
  }, [selectedCases, pick]);

  useEffect(() => {
    if (route.page === "training" && route.autostart) setRoute({ page: "training" });
  }, []);

  const ensureSession = async () => {
    if (session.current === null) {
      const s = await api.createSession("training", selected, puzzle, {solveMode, scrambleType:"case"});
      session.current = s.id;
    }
    return session.current;
  };

  const onStop = useCallback(
    async (ms: number) => {
      if (!current) return;
      setSaving(true);
      try {
        const sessionId = await ensureSession();
        const setupText = (cube ? combineAuf(current.c.setup, current.auf) : current.c.setup);
        const solve = await api.addSolve({ sessionId, caseId: current.c.id, timeMs: ms, scramble: setupText, puzzle });
        setSolves((s) => [...s.filter(item => item.id !== solve.id), solve]);
        bumpStats((v) => v + 1);
        pick(selectedCases);
      } finally {
        setSaving(false);
      }
    },
    [current, selectedCases, pick],
  );

  const timer = useTimer({ onStop, enabled: !!current, canStart: !saving });

  const remove = async (id: number) => {
    await api.deleteSolve(id);
    setSolves((s) => s.filter((x) => x.id !== id));
    bumpStats((v) => v + 1);
  };
  const undoLast = () => {
    const last = solves.at(-1);
    if (last) remove(last.id);
  };

  const primary = current?.c.algorithms[0];
  const shownSetup = current ? (cube ? combineAuf(current.c.setup, current.auf) : current.c.setup) : "";
  const shownAlgorithm = primary && current ? (cube ? compensateAuf(executableAlg(primary), current.auf) : executableAlg(primary)) : "";

  const busy = saving || timer.phase === "running" || timer.phase === "holding" || timer.phase === "ready";
  useEffect(() => { lockCube(busy || !!timer.saveError); return () => lockCube(false); }, [busy, timer.saveError, lockCube]);
  const toggleCases = () => setShowSelector(value => !value);
  const toggleTimes = () => setShowTimes(value => !value);
  const toggleSolution = () => { setHideAlg(value => !value); setRevealed(false); };
  const previousCase = () => {
    const previous = caseHistory.entries[caseHistory.index - 1];
    if (busy || !previous) return;
    setSelected(ids => ids.includes(previous.c.id) ? ids : [...ids, previous.c.id]);
    navigateCase({ type: "previous" });
    setRevealed(false);
    timer.reset();
  };
  const nextCase = () => { if (!busy) { pick(selectedCases); timer.reset(); } };
  useShortcuts([
    { key: "c", run: toggleCases },
    { key: "t", run: toggleTimes },
    { key: "n", run: nextCase },
    { key: "p", run: previousCase },
    { key: "h", run: toggleSolution },
    { key: "a", run: () => { if (supportsAuf) setUseAuf(value => !value); } },
  ], !busy);
  const times = solves.map(solve => effective(solve.time_ms, solve.penalty));

  return (
    <div className="page practice-page">
      <div className={`practice-workspace ${wide ? "with-rails" : ""}`}>
        <PracticePanel open={showSelector} wide={wide} side="left" title="Cases" onClose={() => setShowSelector(false)}>
          {supportsAuf && <label className="switch-row"><input type="checkbox" checked={useAuf} onChange={event => setUseAuf(event.target.checked)} /><span>Random U turn before each setup</span><ShortcutKey letter="A" /></label>}
          <CaseSelector cases={cases} sets={sets} selected={selected} onChange={setSelected} defaultExpanded={wide} />
        </PracticePanel>
        <div className="practice-center">
          <div className="practice-stack">
            {current ? (
              <section className="training-case" aria-label="Current case" data-timer-chrome>
                <div className="training-case-heading">
                  <h1><button type="button" className="training-case-link" disabled={busy} onClick={() => setRoute({ page: "algorithms", caseId: current.c.id })} title="Open case details">{current.c.id}</button></h1>
                  <span className="muted">{current.c.name !== current.c.id ? current.c.name : current.c.group}</span>
                </div>
                <div className="training-setup">
                  <div className="practice-cube"><CaseDiagram c={current.c} size={150} /></div>
                  <div className="training-notation">
                    <span className="practice-caption">Setup</span>
                    <AlgText alg={shownSetup} className="large" />
                  </div>
                </div>
                {primary && (!hideAlg || revealed) && (
                  <div className="training-solution">
                    <span className="practice-caption">Solution</span>
                    <AlgText alg={shownAlgorithm} />
                  </div>
                )}
                {primary && hideAlg && <button className="reveal-solution" onClick={() => setRevealed(value => !value)} disabled={busy}>
                  <IconEye /> {revealed ? "Hide solution" : "Show solution"}
                </button>}
              </section>
            ) : (
              <div className="practice-empty" data-timer-chrome>
                <IconGrid /><h1>Choose your cases</h1>
                <p>Open Cases and select the algorithms to practise.</p>
              </div>
            )}
            <TimerSurface timer={timer} disabled={!current || saving} />
            <div className="practice-stats" data-timer-chrome>
              <Kpi label="Solves" value={String(solves.length)} />
              <Kpi label="Best" value={fmtTime(best(times))} />
              <Kpi label="Mean" value={fmtTime(mean(times))} />
            </div>
          </div>
        </div>
        <PracticePanel open={showTimes} wide={wide} side="right" title="Session" onClose={() => setShowTimes(false)}>
          <TimesPanel selectedCases={selectedCases} solves={solves} onUndo={undoLast} />
        </PracticePanel>
      </div>
      <div className="practice-actions" aria-label="Training controls" data-timer-chrome>
        <button type="button" className="action" aria-expanded={showSelector} disabled={busy} onClick={toggleCases} aria-keyshortcuts="Alt+c">
          <IconGrid /><span>Cases <small>{selectedCases.length}</small></span><ShortcutKey letter="C" />
        </button>
        <button type="button" className="action" aria-pressed={hideAlg} disabled={busy} onClick={toggleSolution} aria-keyshortcuts="Alt+h">
          <IconEye /><span>Hide solution</span><ShortcutKey letter="H" />
        </button>
        <button type="button" className="action" disabled={busy || caseHistory.index <= 0} onClick={previousCase} aria-keyshortcuts="Alt+p">
          <IconBack /><span>Previous</span><ShortcutKey letter="P" />
        </button>
        <button type="button" className="action" disabled={busy || !current} onClick={nextCase} aria-keyshortcuts="Alt+n">
          <IconSkip /><span>Next</span><ShortcutKey letter="N" />
        </button>
        <button type="button" className="action" aria-expanded={showTimes} disabled={busy} onClick={toggleTimes} aria-keyshortcuts="Alt+t">
          <IconTimer /><span>Times</span><ShortcutKey letter="T" />
        </button>
      </div>
    </div>
  );
}

function TimesPanel({ selectedCases, solves, onUndo }: { selectedCases: CaseDto[]; solves: SolveDto[]; onUndo: () => void }) {
  const timesScrollRef = usePreservedScroll(`training-times:${selectedCases[0]?.puzzle_id ?? selectedCases[0]?.cube_size ?? 3}`);
  const byCase = useMemo(() => {
    const m = new Map<string, SolveDto[]>();
    for (const s of solves) if (s.case_id) m.set(s.case_id, [...(m.get(s.case_id) ?? []), s]);
    return m;
  }, [solves]);
  const ordered = [...selectedCases].sort((a, b) => (byCase.get(b.id)?.length ?? 0) - (byCase.get(a.id)?.length ?? 0));
  const allTimes = solves.map((s) => effective(s.time_ms, s.penalty));

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="muted">
          {solves.length} solve{solves.length === 1 ? "" : "s"}
          {solves.length > 0 && <> · best {fmtTime(best(allTimes))} · mean {fmtTime(mean(allTimes))}</>}
        </span>
        <button className="mini-btn" onClick={onUndo} disabled={!solves.length} title="Delete the last time">
          <IconUndo /> Undo
        </button>
      </div>
      <div className="panel-body" ref={timesScrollRef}>
        {ordered.map((c) => {
          const list = byCase.get(c.id) ?? [];
          const times = list.map((s) => effective(s.time_ms, s.penalty));
          const b = best(times);
          return (
            <div key={c.id} className="times-group">
              <div className="times-group-header">
                <span className="times-case-cube" title={c.id}><CaseDiagram c={c} size={48} /></span>
                <span className="stats"><strong>{c.id.replace(/^\S+\s+/, "")}</strong>{list.length ? ` · ${list.length} · best ${fmtTime(b)}` : ""}</span>
              </div>
              <div className="times">
                {[...list].reverse().map((s) => {
                  const t = effective(s.time_ms, s.penalty);
                  return <span key={s.id} data-solve-id={s.id} tabIndex={0} className={`time-chip ${t !== null && t === b ? "best" : ""} ${s.penalty === "dnf" ? "dnf" : ""}`}>{fmtSolve(s.time_ms, s.penalty)}</span>;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
