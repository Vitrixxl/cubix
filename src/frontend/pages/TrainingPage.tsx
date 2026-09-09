import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloatingPortalTarget } from "../components/FloatingSheet";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { casesAtom, deletedSolveIdAtom, hideAlgorithmAtom, randomAufAtom, routeAtom, selectedCaseIdsAtom, setsAtom, statsVersionAtom } from "../state";
import type { CaseDto, SolveDto } from "../../shared/types";
import { api } from "../api";
import { useTimer } from "../hooks/useTimer";
import { TimerSurface } from "../components/TimerSurface";
import { CaseSelector } from "../components/CaseSelector";
import { SetupCube } from "../components/SetupCube";
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { caseState, executableAlg, maskForStage } from "../lib/caseState";
import { combineAuf, compensateAuf, randomAuf, reorientAlgY2 } from "../../shared/cube";
import { EMPTY_TRAINING_HISTORY, trainingHistoryReducer } from "../lib/trainingHistory";
import { best, effective, fmtSolve, fmtTime, mean } from "../lib/format";
import { AlgText } from "../components/AlgorithmList";
import { IconEye, IconSkip, IconUndo, IconGrid, IconTimer, IconShuffle, IconBack } from "../components/icons";

import { PracticeAction } from "../components/PracticeAction";
import { PracticePanel, useWidePractice } from "../components/PracticePanel";
import { ShortcutKey } from "../components/ShortcutKey";
import { useTimerChrome } from "../hooks/useTimerChrome";
import { useShortcuts } from "../hooks/useShortcuts";
import { Kpi } from "./AlgorithmsPage";

const TRAINING_ROTATION = { x: -30, y: 140 };

export function TrainingPage() {
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
      const latest = await api.latestSession("training");
      if (!active || !latest) return;
      if (session.current === null) session.current = latest.id;
      const rows = await api.solves("training",1000);
      if (active) setSolves(rows.filter(s => s.session_id === session.current).reverse());
    };
    void restore();
    window.addEventListener("cubix-local-changed",restore);
    return () => { active = false; window.removeEventListener("cubix-local-changed",restore); };
  },[]);

  const pick = useCallback(
    (pool: CaseDto[]) => {
      navigateCase({ type: "next", pool, sample: Math.random(), auf: useAuf ? randomAuf() : "" });
      setRevealed(false);
    },
    [useAuf],
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
      const s = await api.createSession("training", selected);
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
        const setupText = combineAuf(current.c.setup, current.auf);
        const solve = await api.addSolve({ sessionId, caseId: current.c.id, timeMs: ms, scramble: setupText });
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
  const shownSetup = current ? combineAuf(current.c.setup, current.auf) : "";
  const animatedSetup = shownSetup ? reorientAlgY2(shownSetup) : "";
  const shownAlgorithm = primary && current ? compensateAuf(executableAlg(primary), current.auf) : "";

  const upperMotion = useTimerChrome("up", timer.phase === "running");
  const lowerMotion = useTimerChrome("down", timer.phase === "running");
  const busy = saving || timer.phase === "running" || timer.phase === "holding" || timer.phase === "ready";
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
    { key: "a", run: () => setUseAuf(value => !value) },
  ], !busy);
  const times = solves.map(solve => effective(solve.time_ms, solve.penalty));

  return (
    <div className="page practice-page">
      <div className={`practice-workspace ${wide ? "with-rails" : ""}`}>
        <PracticePanel open={showSelector} wide={wide} side="left" title="Select cases" onClose={() => setShowSelector(false)}>
          <CaseSelector cases={cases} sets={sets} selected={selected} onChange={setSelected} defaultExpanded={wide} />
        </PracticePanel>
        <div className="practice-center">
          <div className="practice-stack training-stack">
            {current ? (
              <motion.section {...upperMotion} className="training-case" aria-label="Current case">
                <div className="training-case-heading">
                  <h1><button type="button" className="training-case-link" disabled={busy} onClick={() => setRoute({ page: "algorithms", caseId: current.c.id })} title="Open case details">{current.c.id}</button></h1>
                  <span className="chip">{current.c.group}</span>
                  {current.c.name !== current.c.id && <p>{current.c.name}</p>}
                </div>
                <div className="training-setup">
                  <div className="practice-cube">
                    <SetupCube alg={animatedSetup} revision={caseHistory.revision} size={128} mask={maskForStage(current.c.stage)} rotation={TRAINING_ROTATION} />
                  </div>
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
                  <IconEye /> {revealed ? "Hide solution" : "Reveal solution"}
                </button>}
              </motion.section>
            ) : (
              <motion.div {...upperMotion} className="practice-empty">
                <IconGrid /><h1>Choose your cases</h1>
                <p>Select a few algorithms and practise at your own pace.</p>
              </motion.div>
            )}
            <TimerSurface timer={timer} disabled={!current || saving} flat />
            <motion.div {...lowerMotion} className="practice-stats">
              <Kpi label="Solves" value={String(solves.length)} />
              <Kpi label="Best" value={fmtTime(best(times))} />
              <Kpi label="Mean" value={fmtTime(mean(times))} />
            </motion.div>
          </div>
        </div>
        <PracticePanel open={showTimes} wide={wide} side="right" title="Session times" onClose={() => setShowTimes(false)}>
          <TimesPanel selectedCases={selectedCases} solves={solves} onUndo={undoLast} />
        </PracticePanel>
      </div>
      <div className="practice-actions training-actions" aria-label="Training controls">
        <PracticeAction running={timer.phase === "running"} aria-expanded={showSelector} disabled={busy} onClick={toggleCases} aria-keyshortcuts="Alt+c">
          <IconGrid /><span>Cases <small>{selectedCases.length}</small></span><ShortcutKey letter="C" />
        </PracticeAction>
        <PracticeAction running={timer.phase === "running"} aria-pressed={useAuf} disabled={busy} onClick={() => setUseAuf(value => !value)} aria-keyshortcuts="Alt+a">
          <IconShuffle /><span>Random AUF</span><ShortcutKey letter="A" />
        </PracticeAction>
        <PracticeAction running={timer.phase === "running"} aria-pressed={hideAlg} disabled={busy} onClick={toggleSolution} aria-keyshortcuts="Alt+h">
          <IconEye /><span>Hide solution</span><ShortcutKey letter="H" />
        </PracticeAction>
        <PracticeAction running={timer.phase === "running"} disabled={busy || caseHistory.index <= 0} onClick={previousCase} aria-label="Previous case" title="Previous case (Alt + P)" aria-keyshortcuts="Alt+p">
          <IconBack /><span>Previous case</span><ShortcutKey letter="P" />
        </PracticeAction>
        <PracticeAction running={timer.phase === "running"} disabled={busy || !current} onClick={nextCase} aria-label="Next case" aria-keyshortcuts="Alt+n">
          <IconSkip /><span>Next case</span><ShortcutKey letter="N" />
        </PracticeAction>
        <PracticeAction running={timer.phase === "running"} aria-expanded={showTimes} disabled={busy} onClick={toggleTimes} aria-keyshortcuts="Alt+t">
          <IconTimer /><span>Times</span><ShortcutKey letter="T" />
        </PracticeAction>
      </div>
    </div>
  );
}

function TimesPanel({ selectedCases, solves, onUndo }: { selectedCases: CaseDto[]; solves: SolveDto[]; onUndo: () => void }) {
  const previewMotion = useTimerChrome("right");
  const portalTarget = useFloatingPortalTarget();
  const [preview, setPreview] = useState<{ name: string; left: number; top: number } | null>(null);
  const showPreview = (element: HTMLElement, name: string) => {
    const rect = element.getBoundingClientRect();
    setPreview({ name, left: rect.left - 10, top: rect.top + rect.height / 2 });
  };
  useEffect(() => {
    const dismiss = () => setPreview(null);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, []);
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
        <div>
          <h2>Session</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            {solves.length} solve{solves.length === 1 ? "" : "s"}
            {solves.length > 0 && <> · mean {fmtTime(mean(allTimes))} · best {fmtTime(best(allTimes))}</>}
          </div>
        </div>
        <button className="btn ghost small" onClick={onUndo} disabled={!solves.length} title="Delete the last time">
          <IconUndo /> Undo
        </button>
      </div>
      <div className="panel-body" onScroll={() => setPreview(null)}>
        {ordered.map((c) => {
          const list = byCase.get(c.id) ?? [];
          const times = list.map((s) => effective(s.time_ms, s.penalty));
          const b = best(times);
          return (
            <div key={c.id} className="times-group">
              <div className="times-group-header">
                <span
                  className="times-case-cube"
                  role="img"
                  aria-label={c.id}
                  tabIndex={0}
                  onMouseEnter={(event) => showPreview(event.currentTarget, c.id)}
                  onMouseLeave={() => setPreview(null)}
                  onFocus={(event) => showPreview(event.currentTarget, c.id)}
                  onBlur={() => setPreview(null)}
                  onKeyDown={(event) => { if (event.key === "Escape") setPreview(null); }}
                >
                  <span aria-hidden="true">
                    <StaticCubeSvg state={caseState(c)} size={56} mask={maskForStage(c.stage)} />
                  </span>
                </span>
                <span className="stats">
                  {list.length ? `${list.length} · best ${fmtTime(b)} · mean ${fmtTime(mean(times))}` : "—"}
                </span>
              </div>
              <div className="times">
                  {[...list].reverse().map((s) => {
                    const t = effective(s.time_ms, s.penalty);
                    return (
                      <span key={s.id} data-solve-id={s.id} tabIndex={0} className={`time-chip ${t !== null && t === b ? "best" : ""} ${s.penalty === "dnf" ? "dnf" : ""}`}>
                        {fmtSolve(s.time_ms, s.penalty)}
                      </span>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
      {createPortal(<AnimatePresence>{preview &&
        <motion.div {...previewMotion} initial={{ opacity: 0, y: 6 }} transition={{ ...previewMotion.transition, opacity: { duration: 0.14 } }} exit={previewMotion.inert ? { ...previewMotion.animate, transition: previewMotion.transition } : { opacity: 0, y: 6, transition: { duration: 0.14 } }} transformTemplate={(_, transform) => `translate(-100%, -50%) ${transform === "none" ? "" : transform}`} className="times-case-popover" style={{ left: preview.left, top: preview.top }} role="tooltip">
          <span className="times-case-popover-arrow" />
          {preview.name}
        </motion.div>}</AnimatePresence>,
        portalTarget,
      )}
    </div>
  );
}
