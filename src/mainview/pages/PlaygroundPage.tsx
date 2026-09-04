import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import type { Penalty, SolveDto } from "../../shared/types";
import { api } from "../api";
import { useTimer } from "../hooks/useTimer";
import { TimerSurface } from "../components/TimerSurface";
import { Cube3D, useAlgPlayer } from "../components/Cube3D";
import { randomScramble, solved } from "../../shared/cube";
import { averageOf, best, effective, fmtDate, fmtSolve, fmtTime, mean } from "../lib/format";
import { Kpi } from "./AlgorithmsPage";
import { IconShuffle } from "../components/icons";
import { playgroundScrambleAtom } from "../state";

export function PlaygroundPage() {
  // The scramble lives in a persisted atom so it survives page changes (and reloads).
  const [scramble, setScramble] = useAtom(playgroundScrambleAtom);
  const [solves, setSolves] = useState<SolveDto[]>([]);
  const session = useRef<number | null>(null);
  const solvedState = useMemo(() => solved(), []);
  const scramblePlayer = useAlgPlayer(solvedState, scramble, { totalDurationMs: 3000, moveGapMs: 12 });

  useEffect(() => {
    if (!scramble) setScramble(randomScramble());
  }, [scramble, setScramble]);

  useEffect(() => {
    if (scramble) scramblePlayer.play();
  }, [scramble, scramblePlayer.play]);

  useEffect(() => {
    api.solves("playground", 1000).then((list) => setSolves([...list].reverse()));
  }, []);

  const ensureSession = async () => {
    if (session.current === null) session.current = (await api.createSession("playground")).id;
    return session.current;
  };

  const onStop = useCallback(
    async (ms: number) => {
      const sessionId = await ensureSession();
      const solve = await api.addSolve({ sessionId, caseId: null, timeMs: ms, scramble });
      setSolves((s) => [...s, solve]);
      setScramble(randomScramble());
    },
    [scramble, setScramble],
  );
  const timer = useTimer({ onStop });

  const remove = async (id: number) => {
    await api.deleteSolve(id);
    setSolves((s) => s.filter((x) => x.id !== id));
  };
  const penalty = async (s: SolveDto, p: Penalty) => {
    const next = s.penalty === p ? "none" : p;
    const updated = await api.setPenalty(s.id, next);
    setSolves((list) => list.map((x) => (x.id === s.id ? updated : x)));
  };

  const times = solves.map((s) => effective(s.time_ms, s.penalty));
  return (
    <div className="page" style={{ paddingBottom: 20 }}>
      <div className="playground float">
        <div className="timer-stage">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={scramble} className="scramble" initial={{ opacity: 0, y: 10, filter: "blur(3px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -10, filter: "blur(3px)" }} transition={{ duration: 0.22 }}>
              {scramble}
            </motion.div>
          </AnimatePresence>
          <button className="btn ghost small" onClick={() => setScramble(randomScramble())}>
            <IconShuffle /> New scramble
          </button>
          <motion.div className="scramble-cube" title="Drag to rotate" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}>
            <Cube3D state={scramblePlayer.state} animation={scramblePlayer.animation} size={190} interactive />
          </motion.div>
          <TimerSurface timer={timer} hint="Scramble your cube, then hold Space to arm the timer" flat />
          <div className="kpi-row">
            <Kpi label="Solves" value={String(solves.length)} />
            <Kpi label="Best" value={fmtTime(best(times))} />
            <Kpi label="Mean" value={fmtTime(mean(times))} />
            <Kpi label="Ao5" value={fmtTime(times.length >= 5 ? averageOf(times.slice(-5)) : null)} />
            <Kpi label="Ao12" value={fmtTime(times.length >= 12 ? averageOf(times.slice(-12)) : null)} />
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Times</h2>
            <motion.span key={solves.length} className="muted" style={{ fontSize: 12 }} initial={{ opacity: 0.4, y: 3 }} animate={{ opacity: 1, y: 0 }}>
              {solves.length} total
            </motion.span>
          </div>
          <div className="panel-body">
            {solves.length === 0 && <div className="empty">No times yet.</div>}
            <AnimatePresence initial={false}>
              {[...solves].reverse().map((s, i) => (
                <motion.div
                  key={s.id}
                  className="solve-row"
                  layout
                  initial={{ opacity: 0, x: 24, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -24, scale: 0.96, transition: { duration: 0.1, ease: "easeIn" } }}
                  transition={{ default: { type: "spring", stiffness: 380, damping: 30 }, layout: { duration: 0.12, ease: "easeOut" } }}
                >
                  <span className="idx">{solves.length - i}</span>
                  <span className={`t ${s.penalty === "dnf" ? "dnf" : ""}`}>{fmtSolve(s.time_ms, s.penalty)}</span>
                  <span className="when">{fmtDate(s.created_at)}</span>
                  <span className="actions">
                    <button className={`mini-btn ${s.penalty === "+2" ? "on" : ""}`} onClick={() => penalty(s, "+2")}>
                      +2
                    </button>
                    <button className={`mini-btn ${s.penalty === "dnf" ? "on" : ""}`} onClick={() => penalty(s, "dnf")}>
                      DNF
                    </button>
                    <button className="mini-btn danger" onClick={() => remove(s.id)}>
                      Delete
                    </button>
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
