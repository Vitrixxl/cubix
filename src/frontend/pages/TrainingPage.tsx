import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { solveModeAtom, puzzleAtom, cubeSwitchLockedAtom, casesAtom, deletedSolveIdAtom, randomAufAtom, routeAtom, selectedCaseIdsAtom, setsAtom, statsVersionAtom } from "../state";
import type { CaseDto, SolveDto } from "../../shared/types";
import { api } from "../api";
import { useTimer } from "../hooks/useTimer";
import { TimerSurface } from "../components/TimerSurface";
import { CaseSelector } from "../components/CaseSelector";
import { puzzleInfo } from "../../shared/puzzles";
import { CaseDiagram } from "../components/CaseDiagram";
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { executableAlg, maskForStage } from "../lib/caseState";
import { applyAlg, combineAuf, compensateAuf, randomAuf, solved } from "../../shared/cube";
import { EMPTY_TRAINING_HISTORY, trainingHistoryReducer } from "../lib/trainingHistory";
import { best, effective, fmtSolve, fmtTime, mean } from "../lib/format";
import { AlgText } from "../components/AlgorithmList";
import { IconEye, IconSkip, IconUndo, IconGrid, IconTimer, IconBack, IconShuffle } from "../components/icons";
import { PanelButton, PracticePanel, useWidePractice } from "../components/PracticePanel";
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
  // The picture must show the cube exactly as it is after the displayed setup, random U turn included.
  const shownState = useMemo(() => cube && shownSetup ? applyAlg(solved(cube), shownSetup) : null, [cube, shownSetup]);
  const shownAlgorithm = primary && current ? (cube ? compensateAuf(executableAlg(primary), current.auf) : executableAlg(primary)) : "";

  const busy = saving || timer.phase === "running" || timer.phase === "holding" || timer.phase === "ready";
  useEffect(() => { lockCube(busy || !!timer.saveError); return () => lockCube(false); }, [busy, timer.saveError, lockCube]);
  const toggleCases = () => setShowSelector(value => !value);
  const toggleTimes = () => setShowTimes(value => !value);
  const toggleSolution = () => setRevealed(value => !value);
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
        <PracticePanel open={showSelector} wide={wide} side="left" title="Cases" icon={<IconGrid />} count={selectedCases.length} shortcut="C" disabled={busy} onOpen={() => setShowSelector(true)} onClose={() => setShowSelector(false)}>
          <CaseSelector cases={cases} sets={sets} selected={selected} onChange={setSelected} defaultExpanded={wide} />
        </PracticePanel>
        <div className="practice-center">
          <div className="practice-toolbar" aria-label="Training controls" data-timer-chrome>
            <div className="toolbar-group">
              {!wide && !showSelector && <PanelButton title="Cases" icon={<IconGrid />} count={selectedCases.length} shortcut="C" disabled={busy} onClick={() => setShowSelector(true)} />}
            </div>
            <div className="toolbar-group">
              {supportsAuf && <button type="button" className="action" aria-pressed={useAuf} disabled={busy} onClick={() => setUseAuf(value => !value)} aria-keyshortcuts="Alt+a" title="Random U turn before each setup">
                <IconShuffle /><span>Random AUF</span><ShortcutKey letter="A" />
              </button>}
            </div>
            <div className="toolbar-group">
              {!wide && !showTimes && <PanelButton title="Times" icon={<IconTimer />} shortcut="T" disabled={busy} onClick={() => setShowTimes(true)} />}
            </div>
          </div>
          <div className="practice-stack">
            {current ? (
              <section className="training-case" aria-label="Current case" data-timer-chrome>
                <div className="training-case-heading">
                  <button type="button" className="case-nav" disabled={busy || caseHistory.index <= 0} onClick={previousCase} aria-keyshortcuts="Alt+p" aria-label="Previous case" title="Previous case (Alt+P)"><IconBack /></button>
                  <h1><button type="button" className="training-case-link" disabled={busy} onClick={() => setRoute({ page: "algorithms", caseId: current.c.id })} title="Open case details">{current.c.id}</button></h1>
                  <span className="muted">{current.c.name !== current.c.id ? current.c.name : current.c.group}</span>
                  <button type="button" className="case-nav" disabled={busy} onClick={nextCase} aria-keyshortcuts="Alt+n" aria-label="Next case" title="Next case (Alt+N)"><IconSkip /></button>
                </div>
                <div className="training-setup">
                  <div className="practice-cube">{shownState ? <StaticCubeSvg state={shownState} size={150} mask={maskForStage(current.c.stage)} /> : <CaseDiagram c={current.c} size={150} />}</div>
                  <div className="training-notation">
                    <span className="practice-caption">Setup</span>
                    <AlgText alg={shownSetup} className="large" />
                  </div>
                </div>
                {primary && revealed && (
                  <div className="training-solution">
                    <span className="practice-caption">Solution</span>
                    <AlgText alg={shownAlgorithm} />
                  </div>
                )}
                {primary && <button className="reveal-solution" onClick={toggleSolution} disabled={busy} aria-keyshortcuts="Alt+h">
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
        <PracticePanel open={showTimes} wide={wide} side="right" title="Session" icon={<IconTimer />} shortcut="T" disabled={busy} onOpen={() => setShowTimes(true)} onClose={() => setShowTimes(false)}>
          <TimesPanel selectedCases={selectedCases} solves={solves} onUndo={undoLast} />
        </PracticePanel>
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
            <div key={c.id} className="session-case">
              <span className="session-case-cube" title={c.id}><CaseDiagram c={c} size={40} /></span>
              <div className="session-case-body">
                <div className="session-case-title"><strong>{c.id.replace(/^\S+\s+/, "")}</strong><span className="muted">{list.length ? `${list.length} · best ${fmtTime(b)} · mean ${fmtTime(mean(times))}` : "no time yet"}</span></div>
                {list.length > 0 && <div className="session-times">
                  {[...list].reverse().map((s) => {
                    const t = effective(s.time_ms, s.penalty);
                    return <span key={s.id} data-solve-id={s.id} tabIndex={0} className={`session-time ${t !== null && t === b ? "best" : ""} ${s.penalty === "dnf" ? "dnf" : ""}`}>{fmtSolve(s.time_ms, s.penalty)}</span>;
                  })}
                </div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
