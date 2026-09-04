import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { casesAtom, hideAlgorithmAtom, randomAufAtom, routeAtom, selectedCaseIdsAtom, setsAtom, statsVersionAtom } from "../state";
import type { CaseDto, SolveDto } from "../../shared/types";
import { api } from "../api";
import { useTimer } from "../hooks/useTimer";
import { TimerSurface } from "../components/TimerSurface";
import { CaseSelector } from "../components/CaseSelector";
import { Cube3D, useAlgPlayer } from "../components/Cube3D";
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { caseState, executableAlg, maskForStage } from "../lib/caseState";
import { combineAuf, compensateAuf, randomAuf, reorientAlgY2, solved } from "../../shared/cube";
import { best, effective, fmtSolve, fmtTime, mean } from "../lib/format";
import { AlgText } from "../components/AlgorithmList";
import { IconClose, IconEye, IconSkip, IconUndo } from "../components/icons";

interface Current {
  c: CaseDto;
  auf: string;
}

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
  const [current, setCurrent] = useState<Current | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [solves, setSolves] = useState<SolveDto[]>([]);
  const [showSelector, setShowSelector] = useState(() => !(route.page === "training" && route.autostart) && window.innerWidth >= 1400);
  const session = useRef<number | null>(null);
  const lastId = useRef<string | null>(null);

  const pick = useCallback(
    (pool: CaseDto[]) => {
      if (!pool.length) return setCurrent(null);
      let candidates = pool;
      if (pool.length > 1 && lastId.current) candidates = pool.filter((c) => c.id !== lastId.current);
      const c = candidates[Math.floor(Math.random() * candidates.length)];
      lastId.current = c.id;
      setCurrent({ c, auf: useAuf ? randomAuf() : "" });
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
      const sessionId = await ensureSession();
      const setupText = combineAuf(current.c.setup, current.auf);
      const solve = await api.addSolve({ sessionId, caseId: current.c.id, timeMs: ms, scramble: setupText });
      setSolves((s) => [...s, solve]);
      bumpStats((v) => v + 1);
      pick(selectedCases);
    },
    [current, selectedCases, pick],
  );

  const timer = useTimer({ onStop, enabled: true });

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
  const solvedState = useMemo(() => solved(), []);
  const setupPlayer = useAlgPlayer(solvedState, animatedSetup, { totalDurationMs: 3000, moveGapMs: 12 });

  useEffect(() => {
    if (shownSetup) setupPlayer.play();
  }, [shownSetup, setupPlayer.play]);

  return (
    <div className="page" style={{ paddingBottom: 20 }}>
      <div className={`training ${showSelector ? "" : "no-selector"}`}>
        <AnimatePresence initial={false}>
          {showSelector && (
            <motion.div key="selector" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} style={{ minHeight: 0, display: "flex" }}>
              <CaseSelector cases={cases} sets={sets} selected={selected} onChange={setSelected} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="timer-stage">
          <div className="toolbar">
            <button className="btn small" onClick={() => setShowSelector((v) => !v)}>
              {showSelector ? "Hide cases" : "Select cases"}
            </button>
            <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
              {selectedCases.length} case{selectedCases.length === 1 ? "" : "s"} in rotation
            </span>
            <div className="switches">
              <button className={`switch ${useAuf ? "on" : ""}`} onClick={() => setUseAuf((v) => !v)}>
                <span className="switch-track" /> Random AUF
              </button>
              <button className={`switch ${hideAlg ? "on" : ""}`} onClick={() => setHideAlg((v) => !v)}>
                <span className="switch-track" /> Hide algorithm
              </button>
            </div>
          </div>

          {current ? (
            <div className="case-banner">
              <div className="cube-box">
                <Cube3D state={setupPlayer.state} animation={setupPlayer.animation} size={96} mask={maskForStage(current.c.stage)} rotation={TRAINING_ROTATION} style={{ contain: "layout" }} />
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={current.c.id + current.auf}
                  className="info"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="title">
                    {current.c.id}
                    {current.c.name !== current.c.id && <span className="subtle" style={{ fontWeight: 500, fontSize: 15 }}>{current.c.name}</span>}
                    <span className="chip">{current.c.group}</span>
                  </div>
                  <div className="label">Setup</div>
                  <AlgText alg={shownSetup} className="large" />
                  {primary && (
                    <>
                      <div className="label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        Algorithm
                        {hideAlg && (
                          <button className="mini-btn" onClick={() => setRevealed((r) => !r)} style={{ textTransform: "none", letterSpacing: 0 }}>
                            <IconEye style={{ width: 12, height: 12, verticalAlign: -2 }} /> {revealed ? "hide" : "reveal"}
                          </button>
                        )}
                      </div>
                      <div className={hideAlg && !revealed ? "blur" : ""} onClick={() => hideAlg && setRevealed(true)}>
                        <AlgText alg={shownAlgorithm} />
                      </div>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
              <button className="btn ghost small" onClick={() => pick(selectedCases)} title="Skip this case">
                <IconSkip /> Skip
              </button>
            </div>
          ) : (
            <div className="empty" style={{ width: "100%" }}>
              Select at least one case to start training.
            </div>
          )}

          <TimerSurface timer={timer} hint={current ? "Set up the case, then hold Space to arm the timer" : undefined} />
        </div>

        <TimesPanel selectedCases={selectedCases} solves={solves} onRemove={remove} onUndo={undoLast} />
      </div>
    </div>
  );
}

function TimesPanel({ selectedCases, solves, onRemove, onUndo }: { selectedCases: CaseDto[]; solves: SolveDto[]; onRemove: (id: number) => void; onUndo: () => void }) {
  const [preview, setPreview] = useState<{ c: CaseDto; left: number; top: number } | null>(null);
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
            <motion.div
              key={c.id}
              className="times-group"
              layout
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="times-group-header">
                <span
                  className="times-case-name"
                  onMouseEnter={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const popoverSize = 92;
                    const gap = 6;
                    const left = Math.max(8, Math.min(window.innerWidth - popoverSize - 8, rect.left + (rect.width - popoverSize) / 2));
                    const top = Math.max(8, rect.top - popoverSize - gap);
                    setPreview({ c, left, top });
                  }}
                  onMouseLeave={() => setPreview(null)}
                >
                  {c.id}
                </span>
                <span className="stats">
                  {list.length ? `${list.length} · best ${fmtTime(b)} · mean ${fmtTime(mean(times))}` : "—"}
                </span>
              </div>
              <div className="times">
                <AnimatePresence initial={false}>
                  {[...list].reverse().map((s) => {
                    const t = effective(s.time_ms, s.penalty);
                    return (
                      <motion.span key={s.id} className={`time-chip ${t !== null && t === b ? "best" : ""} ${s.penalty === "dnf" ? "dnf" : ""}`} layout initial={{ opacity: 0, scale: 0.5, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ type: "spring", stiffness: 500, damping: 28 }}>
                        {fmtSolve(s.time_ms, s.penalty)}
                        <button className="x" onClick={() => onRemove(s.id)} title="Delete this time">
                          <IconClose />
                        </button>
                      </motion.span>
                    );
                  })}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>
      {preview && (
        <div className="times-case-popover" style={{ left: preview.left, top: preview.top }} role="tooltip">
          <StaticCubeSvg state={caseState(preview.c)} size={84} mask={maskForStage(preview.c.stage)} />
        </div>
      )}
    </div>
  );
}
