import {usePreservedScroll} from "../hooks/usePreservedScroll";
import { SolveInfoButton } from "../components/SolveInfoButton";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import type { Penalty, SolveDto } from "../../shared/types";
import { api } from "../api";
import { useTimer } from "../hooks/useTimer";
import { TimerSurface } from "../components/TimerSurface";
import { PuzzlePreview } from "../components/PuzzlePreview";
import { generatePracticeScramble } from "../lib/practiceScramble";
import { contextKey, puzzleInfo, scrambleLabel, type PracticeContext, type ScrambleType, SOLVE_MODES } from "../../shared/puzzles";
import { averageOf, best, effective, fmtSolve, fmtTime, mean } from "../lib/format";
import { Kpi } from "../components/Kpi";
import { IconShuffle, IconTimer } from "../components/icons";
import { threeDEnabledAtom, practiceContextAtom, solveModeAtom, scrambleTypeAtom, cubeSwitchLockedAtom, deletedSolveIdAtom, playgroundScrambleAtom } from "../state";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AlgText } from "../components/AlgorithmList";
import { PracticeAction } from "../components/PracticeAction";
import { PracticePanel, useWidePractice } from "../components/PracticePanel";
import { ShortcutKey } from "../components/ShortcutKey";
import { useTimerChrome } from "../hooks/useTimerChrome";
import { useShortcuts } from "../hooks/useShortcuts";

export function PlaygroundPage() {
  const context = useAtomValue(practiceContextAtom);
  return <PlaygroundSession context={context} />;
}
function PlaygroundSession({context}: {context: PracticeContext}) {
  const info = puzzleInfo(context.puzzle);
  const show3D = useAtomValue(threeDEnabledAtom);
  const [,setSolveMode] = useAtom(solveModeAtom);
  const [, setScrambleType] = useAtom(scrambleTypeAtom);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const request = useRef(0);
  const alive = useRef(true);
  const lockCube = useSetAtom(cubeSwitchLockedAtom);
  const [saving, setSaving] = useState(false);
  // The scramble lives in a persisted atom so it survives page changes (and reloads).
  const [scramble, setScramble] = useAtom(playgroundScrambleAtom);
  const [solves, setSolves] = useState<SolveDto[]>([]);
  const deletedSolveId = useAtomValue(deletedSolveIdAtom);
  useEffect(() => { if (deletedSolveId !== null) setSolves(list => list.filter(solve => solve.id !== deletedSolveId)); }, [deletedSolveId]);
  const wide = useWidePractice();
  const [showTimes, setShowTimes] = useState(false);
  const session = useRef<number | null>(null);

  const generateNext = useCallback(async () => {
    const id = ++request.current;
    setGenerating(true); setGenerationError("");
    try {
      const next = await generatePracticeScramble(context);
      if (alive.current && request.current === id) setScramble(next);
    } catch (error) {
      if (alive.current && request.current === id) setGenerationError((error as Error).message);
    } finally {
      if (alive.current && request.current === id) setGenerating(false);
    }
  }, [context, setScramble]);
  const practiceKey=contextKey(context);
  useEffect(() => {
    let active=true;
    const refresh = () => { void api.solves("playground", 1000, context.puzzle, context).then(list => {
      if(active)setSolves([...list].reverse());
    }); };
    refresh(); window.addEventListener("cubix-local-changed",refresh);
    window.addEventListener("storage",refresh);
    return () => { active=false; window.removeEventListener("cubix-local-changed",refresh); window.removeEventListener("storage",refresh); };
  }, [practiceKey]);

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
  // Reset the attempt and its data, while keeping the expensive WebGL viewport alive.
  useLayoutEffect(() => {
    alive.current=true;request.current++;
    session.current=null;setSolves([]);setGenerationError("");setGenerating(false);
    timer.reset();
    if(!scramble)void generateNext();
    return()=>{alive.current=false;request.current++;};
  },[practiceKey]);


  const penalty = async (s: SolveDto, p: Penalty) => {
    const next = s.penalty === p ? "none" : p;
    const updated = await api.setPenalty(s.id, next);
    setSolves((list) => list.map((x) => (x.id === s.id ? updated : x)));
  };

  const times = solves.map((s) => effective(s.time_ms, s.penalty));

  const upperMotion = useTimerChrome("up", timer.phase === "running");
  const lowerMotion = useTimerChrome("down", timer.phase === "running");
  const busy = saving || timer.phase === "running" || timer.phase === "holding" || timer.phase === "ready";
  useEffect(() => { lockCube(busy || !!timer.saveError); return () => lockCube(false); }, [busy, timer.saveError, lockCube]);
  const nextScramble = () => { if (!busy && !generating) void generateNext(); };
  const toggleTimes = () => setShowTimes(value => !value);
  useShortcuts([{ key: "n", run: nextScramble }, { key: "t", run: toggleTimes }], !busy);

  const timesScrollRef=usePreservedScroll(`playground-times:${context.puzzle}:${context.solveMode}:${context.scrambleType}`);
  return (
    <div className="page practice-page">
      <div className={`practice-workspace ${wide ? "with-rails" : ""}`}>
        {wide && <div className="practice-rail left" />}
        <div className="practice-center">
          <div className="practice-stack playground-stack">
            <motion.div {...upperMotion} className={`practice-scramble ${!info.cubeSize || info.cubeSize > 3 ? "big-cube-scramble" : ""}`} aria-label="Scramble">
              <span className="practice-caption">{info.label} · {scrambleLabel(context.scrambleType)}</span>
              {generating ? <span className="muted" role="status">Generating scramble…</span> : generationError ? <span role="alert">{generationError} <button className="mini-btn" onClick={() => void generateNext()}>Retry</button></span> : <AlgText alg={scramble} />}
            </motion.div>
            {show3D && <motion.div {...upperMotion} className="practice-cube">
              <PuzzlePreview puzzle={context.puzzle} alg={scramble} />
            </motion.div>}
            <TimerSurface timer={timer} flat />
            <motion.div {...lowerMotion} className="practice-stats">
              <Kpi label="Solves" value={String(solves.length)} />
              <Kpi label="Best" value={fmtTime(best(times))} />
              <Kpi label="Mean" value={fmtTime(mean(times))} />
              <Kpi label="Ao5" value={fmtTime(times.length >= 5 ? averageOf(times.slice(-5)) : null)} />
              <Kpi label="Ao12" value={fmtTime(times.length >= 12 ? averageOf(times.slice(-12)) : null)} />
            </motion.div>
          </div>
        </div>
        <PracticePanel open={showTimes} wide={wide} side="right" title="Times" onClose={() => setShowTimes(false)}>
        <div className="panel">
          <div className="panel-header">
            <h2>Times</h2>
            <motion.span key={solves.length} className="muted" style={{ fontSize: 12 }} initial={{ opacity: 0.4, y: 3 }} animate={{ opacity: 1, y: 0 }}>
              {solves.length} total
            </motion.span>
          </div>
          <div className="panel-body" ref={timesScrollRef}>
            {solves.length === 0 && <div className="empty">No times yet.</div>}
            <AnimatePresence initial={false}>
              {[...solves].reverse().map((s, i) => (
                <motion.div
                  key={s.id}
                  className="solve-row"
                  data-solve-id={s.id} tabIndex={0}
                  layout
                  initial={{ opacity: 0, x: 24, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -24, scale: 0.96, transition: { duration: 0.1, ease: "easeIn" } }}
                  transition={{ default: { type: "spring", stiffness: 380, damping: 30 }, layout: { duration: 0.12, ease: "easeOut" } }}
                >
                  <span className="idx">{solves.length - i}</span>
                  <span className={`t ${s.penalty === "dnf" ? "dnf" : ""}`}>{fmtSolve(s.time_ms, s.penalty)}</span>
                  <SolveInfoButton solve={s} />
                  <span className="actions">

                    <button className={`mini-btn ${s.penalty === "+2" ? "on" : ""}`} onClick={() => penalty(s, "+2")}>
                      +2
                    </button>
                    <button className={`mini-btn ${s.penalty === "dnf" ? "on" : ""}`} onClick={() => penalty(s, "dnf")}>
                      DNF
                    </button>
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
        </PracticePanel>
      </div>
      <div className="practice-actions playground-actions" aria-label="Playground controls">
        <motion.div {...lowerMotion} className="playground-context">
          <div className="playground-scramble-control">
            <Select value={context.scrambleType} disabled={busy || !!timer.saveError} onValueChange={value=>setScrambleType(value as ScrambleType)}>
              <SelectTrigger aria-label="Scramble type"><SelectValue/></SelectTrigger>
              <SelectContent>{info.scrambles.map(type=><SelectItem key={type} value={type}>{scrambleLabel(type)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="solve-mode-toggle" role="group" aria-label="Solve mode" data-practice-control>
            {SOLVE_MODES.map(mode=><button type="button" key={mode.id} aria-pressed={context.solveMode===mode.id} disabled={busy || !!timer.saveError} onClick={()=>setSolveMode(mode.id)}>{mode.label}</button>)}
          </div>
        </motion.div>

        <PracticeAction running={timer.phase === "running"} onClick={nextScramble} disabled={busy || generating} aria-keyshortcuts="Alt+n"><IconShuffle /><span>New scramble</span><ShortcutKey letter="N" /></PracticeAction>
        <PracticeAction running={timer.phase === "running"} onClick={toggleTimes} disabled={busy} aria-expanded={showTimes} aria-keyshortcuts="Alt+t"><IconTimer /><span>Times</span><ShortcutKey letter="T" /></PracticeAction>
      </div>
    </div>
  );
}
