import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { SolveInfoButton } from "../components/SolveInfoButton";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type { Penalty, SolveDto } from "../../shared/types";
import { api } from "../api";
import { useTimer } from "../hooks/useTimer";
import { TimerSurface } from "../components/TimerSurface";
import { generatePracticeScramble } from "../lib/practiceScramble";
import { contextKey, puzzleInfo, scrambleLabel, type PracticeContext, type ScrambleType, type SolveMode, SOLVE_MODES } from "../../shared/puzzles";
import { averageOf, best, effective, fmtSolve, fmtTime, mean } from "../lib/format";
import { Kpi } from "../components/Kpi";
import { IconShuffle, IconTimer } from "../components/icons";
import { practiceContextAtom, solveModeAtom, scrambleTypeAtom, cubeSwitchLockedAtom, deletedSolveIdAtom, playgroundScrambleAtom } from "../state";
import { AlgText } from "../components/AlgorithmList";
import { PracticePanel, useWidePractice } from "../components/PracticePanel";
import { ShortcutKey } from "../components/ShortcutKey";
import { useShortcuts } from "../hooks/useShortcuts";

export function PlaygroundPage() {
  const context = useAtomValue(practiceContextAtom);
  const [showTimes, setShowTimes] = useState(false);
  // A new puzzle, mode or scramble type starts a fresh attempt and session.
  return <PlaygroundSession key={contextKey(context)} context={context} showTimes={showTimes} setShowTimes={setShowTimes} />;
}

function PlaygroundSession({ context, showTimes, setShowTimes }: { context: PracticeContext; showTimes: boolean; setShowTimes: (update: (value: boolean) => boolean) => void }) {
  const info = puzzleInfo(context.puzzle);
  const setSolveMode = useSetAtom(solveModeAtom);
  const setScrambleType = useSetAtom(scrambleTypeAtom);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const request = useRef(0);
  const lockCube = useSetAtom(cubeSwitchLockedAtom);
  const [saving, setSaving] = useState(false);
  // The scramble lives in a persisted atom so it survives page changes (and reloads).
  const [scramble, setScramble] = useAtom(playgroundScrambleAtom);
  const [solves, setSolves] = useState<SolveDto[]>([]);
  const deletedSolveId = useAtomValue(deletedSolveIdAtom);
  useEffect(() => { if (deletedSolveId !== null) setSolves(list => list.filter(solve => solve.id !== deletedSolveId)); }, [deletedSolveId]);
  const wide = useWidePractice();
  const session = useRef<number | null>(null);

  const generateNext = useCallback(async () => {
    const id = ++request.current;
    setGenerating(true); setGenerationError("");
    try {
      const next = await generatePracticeScramble(context);
      if (request.current === id) setScramble(next);
    } catch (error) {
      if (request.current === id) setGenerationError((error as Error).message);
    } finally {
      if (request.current === id) setGenerating(false);
    }
  }, [context, setScramble]);
  useEffect(() => {
    let active = true;
    const refresh = () => { void api.solves("playground", 1000, context.puzzle, context).then(list => { if (active) setSolves([...list].reverse()); }); };
    refresh(); window.addEventListener("cubix-local-changed", refresh);
    window.addEventListener("storage", refresh);
    if (!scramble) void generateNext();
    return () => { active = false; request.current++; window.removeEventListener("cubix-local-changed", refresh); window.removeEventListener("storage", refresh); };
  }, []);

  const ensureSession = async () => {
    if (session.current === null) session.current = (await api.createSession("playground", [], context.puzzle, context)).id;
    return session.current;
  };

  const onStop = useCallback(
    async (ms: number) => {
      setSaving(true);
      try {
        const sessionId = await ensureSession();
        const solve = await api.addSolve({ sessionId, caseId: null, timeMs: ms, scramble, ...context });
        setSolves((s) => [...s.filter(item => item.id !== solve.id), solve]);
        void generateNext();
      } finally { setSaving(false); }
    },
    [scramble, context, generateNext],
  );
  const timer = useTimer({ onStop, canStart: !saving && !generating && !!scramble && !generationError });

  const penalty = async (s: SolveDto, p: Penalty) => {
    const next = s.penalty === p ? "none" : p;
    const updated = await api.setPenalty(s.id, next);
    setSolves((list) => list.map((x) => (x.id === s.id ? updated : x)));
  };

  const times = solves.map((s) => effective(s.time_ms, s.penalty));
  const busy = saving || timer.phase === "running" || timer.phase === "holding" || timer.phase === "ready";
  useEffect(() => { lockCube(busy || !!timer.saveError); return () => lockCube(false); }, [busy, timer.saveError, lockCube]);
  const nextScramble = () => { if (!busy && !generating) void generateNext(); };
  const toggleTimes = () => setShowTimes(value => !value);
  useShortcuts([{ key: "n", run: nextScramble }, { key: "t", run: toggleTimes }], !busy);

  const timesScrollRef = usePreservedScroll(`playground-times:${contextKey(context)}`);
  return (
    <div className="page practice-page">
      <div className={`practice-workspace ${wide ? "with-rails" : ""}`}>
        {wide && <div className="practice-rail left" />}
        <div className="practice-center">
          <div className="practice-stack">
            <div className={`practice-scramble ${!info.cubeSize || info.cubeSize > 3 ? "big-cube-scramble" : ""}`} aria-label="Scramble" data-timer-chrome>
              <span className="practice-caption">{info.label} · {scrambleLabel(context.scrambleType)}</span>
              {generating ? <span className="muted" role="status">Generating…</span> : generationError ? <span role="alert">{generationError} <button className="mini-btn" onClick={() => void generateNext()}>Retry</button></span> : <AlgText alg={scramble} />}
            </div>
            <TimerSurface timer={timer} />
            <div className="practice-stats" data-timer-chrome>
              <Kpi label="Solves" value={String(solves.length)} />
              <Kpi label="Best" value={fmtTime(best(times))} />
              <Kpi label="Mean" value={fmtTime(mean(times))} />
              <Kpi label="Ao5" value={fmtTime(times.length >= 5 ? averageOf(times.slice(-5)) : null)} />
              <Kpi label="Ao12" value={fmtTime(times.length >= 12 ? averageOf(times.slice(-12)) : null)} />
            </div>
          </div>
        </div>
        <PracticePanel open={showTimes} wide={wide} side="right" title="Times" onClose={() => setShowTimes(() => false)}>
          <div className="panel">
            <div className="panel-header"><span className="muted">{solves.length} solves</span></div>
            <div className="panel-body" ref={timesScrollRef}>
              {solves.length === 0 && <div className="empty">No times yet.</div>}
              {[...solves].reverse().map((s, i) => (
                <div key={s.id} className="solve-row" data-solve-id={s.id} tabIndex={0}>
                  <span className="idx">{solves.length - i}</span>
                  <span className={`t ${s.penalty === "dnf" ? "dnf" : ""}`}>{fmtSolve(s.time_ms, s.penalty)}</span>
                  <SolveInfoButton solve={s} />
                  <span className="actions">
                    <button className={`mini-btn ${s.penalty === "+2" ? "on" : ""}`} onClick={() => penalty(s, "+2")}>+2</button>
                    <button className={`mini-btn ${s.penalty === "dnf" ? "on" : ""}`} onClick={() => penalty(s, "dnf")}>DNF</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </PracticePanel>
      </div>
      <div className="practice-actions" aria-label="Timer controls" data-timer-chrome>
        <select className="select" aria-label="Scramble type" value={context.scrambleType} disabled={busy || !!timer.saveError} data-timer-ignore onChange={event => { setScrambleType(event.target.value as ScrambleType); event.currentTarget.blur(); }}>
          {info.scrambles.map(type => <option key={type} value={type}>{scrambleLabel(type)}</option>)}
        </select>
        <select className="select" aria-label="Solve mode" value={context.solveMode} disabled={busy || !!timer.saveError} data-timer-ignore onChange={event => { setSolveMode(event.target.value as SolveMode); event.currentTarget.blur(); }}>
          {SOLVE_MODES.map(mode => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
        </select>
        <button type="button" className="action" onClick={nextScramble} disabled={busy || generating} aria-keyshortcuts="Alt+n"><IconShuffle /><span>New scramble</span><ShortcutKey letter="N" /></button>
        <button type="button" className="action" onClick={toggleTimes} disabled={busy} aria-expanded={showTimes} aria-keyshortcuts="Alt+t"><IconTimer /><span>Times</span><ShortcutKey letter="T" /></button>
      </div>
    </div>
  );
}
