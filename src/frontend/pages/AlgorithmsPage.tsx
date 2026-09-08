import { memo, useEffect, useMemo, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { unwrap } from "jotai/utils";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { casesAtom, routeAtom, selectedCaseIdsAtom, setByStageAtom, setsAtom, stageAtom, statsAtom } from "../state";
import { STAGES, type CaseDto, type CaseHistoryDto, type CaseStatsDto } from "../../shared/types";
import { Cube3D, useAlgPlayer } from "../components/Cube3D";
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { caseState, displayAlg, executableAlg, maskForStage } from "../lib/caseState";
import { fmtTime } from "../lib/format";
import { api } from "../api";
import { AlgorithmList, AlgText } from "../components/AlgorithmList";
import { TimesChart } from "../components/TimesChart";
import { IconBack, IconPause, IconPlay, IconReset, IconStep, IconTimer } from "../components/icons";
import { formatAlg } from "../../shared/cube";

import { useShortcuts } from "../hooks/useShortcuts";
import { ShortcutKey } from "../components/ShortcutKey";

const statsMapAtom = unwrap(statsAtom, (prev) => prev ?? new Map<string, CaseStatsDto>());

const listVariants = { hidden: {}, show: { transition: { staggerChildren: 0.014, delayChildren: 0.03 } }, exit: { opacity: 0, transition: { duration: 0.12 } } };
const itemVariants = { hidden: { opacity: 0, y: 14, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 380, damping: 28 } } };

export function AlgorithmsPage() {
  const cases = useAtomValue(casesAtom);
  const sets = useAtomValue(setsAtom);
  const stats = useAtomValue(statsMapAtom);
  const [stage, setStage] = useAtom(stageAtom);
  const [setByStage, setSetByStage] = useAtom(setByStageAtom);
  const [route, setRoute] = useAtom(routeAtom);
  const setSelection = useSetAtom(selectedCaseIdsAtom);
  const caseId = route.page === "algorithms" ? route.caseId : undefined;
  const selected = caseId ? cases.find((c) => c.id === caseId) : undefined;
  const trainAll = (list: CaseDto[]) => {
    setSelection(list.map((c) => c.id));
    setRoute({ page: "training", autostart: true });
  };

  const stageSets = sets.filter((s) => s.stage === stage);
  const activeSet = stageSets.find((s) => s.id === setByStage[stage]) ?? stageSets[0];
  const visible = useMemo(() => cases.filter((c) => c.set === activeSet?.id), [cases, activeSet?.id]);
  const groups = useMemo(() => {
    const m = new Map<string, CaseDto[]>();
    for (const c of visible) m.set(c.group, [...(m.get(c.group) ?? []), c]);
    return [...m.entries()];
  }, [visible]);

  return (
    <div className="page algorithms-page">
        <AnimatePresence mode="wait" initial={false}>
          {selected ? (
            <CaseDetail key={selected.id} c={selected} stats={stats.get(selected.id)} onBack={() => setRoute({ page: "algorithms" })} />
          ) : (
            <motion.div key="grid" className="case-browser" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              <div className="page-header">
                <LayoutGroup id="stage-tabs">
                  <div className="tabs">
                    {STAGES.map((s) => (
                      <motion.button key={s} className={`tab ${s === stage ? "active" : ""}`} onClick={() => setStage(s)}>
                        {s === stage && <motion.span className="tab-pill" layoutId="stage-pill" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                        <span>{s}</span>
                      </motion.button>
                    ))}
                  </div>
                </LayoutGroup>
                <LayoutGroup id={`set-tabs-${stage}`}>
                  <div className="tabs small">
                    {stageSets.map((s) => (
                      <motion.button key={s.id} className={`tab ${s.id === activeSet?.id ? "active" : ""}`} onClick={() => setSetByStage({ ...setByStage, [stage]: s.id })} title={s.description}>
                        {s.id === activeSet?.id && <motion.span className="tab-pill" layoutId="set-pill" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                        <span>{s.label}</span>
                        <span className="count">{s.count}</span>
                      </motion.button>
                    ))}
                  </div>
                </LayoutGroup>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p key={activeSet?.id} className="subtle" style={{ margin: "0 0 8px" }} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
                  {activeSet?.description}
                </motion.p>
              </AnimatePresence>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={activeSet?.id} className="case-list" variants={listVariants} initial="hidden" animate="show" exit="exit">
                  {groups.map(([group, list]) => (
                    <section key={group}>
                      <motion.div className="group-title" variants={itemVariants}>
                        {group}
                        <span className="count">{list.length}</span>
                        <button type="button" className="btn ghost small group-train" onClick={() => trainAll(list)} title={`Train the ${list.length} cases of ${group}`}>
                          <IconTimer /> Train all
                        </button>
                      </motion.div>
                      <div className="grid-cases">
                        {list.map((c) => (
                          <CaseCard key={c.id} c={c} stats={stats.get(c.id)} onOpen={() => setRoute({ page: "algorithms", caseId: c.id })} />
                        ))}
                      </div>
                    </section>
                  ))}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
}

function CaseCard({ c, stats, onOpen }: { c: CaseDto; stats?: CaseStatsDto; onOpen: () => void }) {
  return (
    <motion.button className="case-card" onClick={onOpen} variants={itemVariants}>
      {stats && <span className="trained-dot" title={`${stats.count} solves`} />}
      <div className="case-cube">
        <StaticCubeSvg state={caseState(c)} size={102} mask={maskForStage(c.stage)} />
      </div>
      <div className="case-id">{c.id}</div>
      {c.name !== c.id && <div className="case-name">{c.name}</div>}
      <div className="case-stats">
        {stats ? (
          <>
            <span>
              best <b>{fmtTime(stats.best)}</b>
            </span>
            <span>
              avg <b>{fmtTime(stats.mean)}</b>
            </span>
          </>
        ) : (
          <span className="muted">not trained</span>
        )}
      </div>
    </motion.button>
  );
}

function CaseDetail({ c, stats, onBack }: { c: CaseDto; stats?: CaseStatsDto; onBack: () => void }) {
  const setRoute = useSetAtom(routeAtom);
  const setSelection = useSetAtom(selectedCaseIdsAtom);
  const [algIndex, setAlgIndex] = useState(0);
  const [history, setHistory] = useState<CaseHistoryDto | null>(null);
  const initial = useMemo(() => caseState(c), [c.id]);
  const active = c.algorithms[algIndex] ?? c.algorithms[0];
  const player = useAlgPlayer(initial, executableAlg(active));

  useEffect(() => {
    let alive = true;
    api.caseHistory(c.id).then((h) => alive && setHistory(h));
    return () => {
      alive = false;
    };
  }, [c.id, stats?.count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector('[aria-modal="true"]')) onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const train = () => {
    setSelection([c.id]);
    setRoute({ page: "training", autostart: true });
  };
  useShortcuts([
    { key: "b", run: onBack },
    { key: "t", run: train },
    { key: "p", run: player.playing ? player.pause : player.play },
    { key: "r", run: player.reset },
    { key: "j", run: () => { if (!player.playing && player.index < player.total) player.stepForward(); } },
  ]);
  const summary = history?.summary ?? stats;

  return (
    <motion.div className="detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <motion.div className="detail-left" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }} initial="hidden" animate="show">
        <motion.button className="btn ghost small" onClick={onBack} style={{ marginLeft: -10, marginBottom: 10 }} variants={itemVariants}>
          <IconBack /> {c.setLabel} <ShortcutKey letter="B" />
        </motion.button>
        <motion.div className="detail-title" variants={itemVariants}>
          <h1>{c.id}</h1>
          {c.name !== c.id && <span className="subtle" style={{ fontSize: 17 }}>{c.name}</span>}
        </motion.div>
        <motion.div className="detail-meta" variants={itemVariants}>
          <span className="chip">{c.stage}</span>
          <span className="chip">{c.group}</span>
          {c.subgroup && c.subgroup !== c.group && <span className="chip">{c.subgroup}</span>}
          {c.probability && <span className="chip">P = {c.probability}</span>}
          <span className="chip">{c.algorithms.length} algorithms</span>
        </motion.div>

        <motion.div className="card" variants={itemVariants}>
          <div className="setup-block">
            <div>
              <h2>Setup</h2>
              <p className="muted" style={{ margin: "0 0 10px", fontSize: 12 }}>
                Apply on a solved cube (yellow up, green front) to get this case.
              </p>
              <AlgText alg={formatAlg(c.setup)} className="large" />
            </div>
            <button className="btn primary" onClick={train} aria-keyshortcuts="Alt+t">
              <IconTimer /> Train this case <ShortcutKey letter="T" />
            </button>
          </div>
          {c.setups_alt.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>
                {c.setups_alt.length} alternative setup{c.setups_alt.length > 1 ? "s" : ""}
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {c.setups_alt.map((s) => (
                  <AlgText key={s} alg={s} />
                ))}
              </div>
            </details>
          )}
        </motion.div>

        <motion.div className="card" variants={itemVariants}>
          <h2>Algorithms</h2>
          <AlgorithmList algorithms={c.algorithms} activeIndex={algIndex} onSelect={setAlgIndex} />
        </motion.div>

        <motion.div className="card" variants={itemVariants}>
          <h2>Statistics</h2>
          {summary && summary.count > 0 ? (
            <>
              <div className="kpi-row" style={{ marginBottom: 16 }}>
                <Kpi label="Solves" value={String(summary.count)} />
                <Kpi label="Best" value={fmtTime(summary.best)} />
                <Kpi label="Mean" value={fmtTime(summary.mean)} />
                <Kpi label="Ao5" value={fmtTime(summary.ao5)} />
                <Kpi label="Ao12" value={fmtTime(summary.ao12)} />
                <Kpi label="Best Ao5" value={fmtTime(summary.bestAo5)} />
              </div>
              {history && <TimesChart history={history.history} ao5={history.ao5} />}
            </>
          ) : (
            <div className="empty">Not trained yet. Start a session to track your progress on this case.</div>
          )}
        </motion.div>
      </motion.div>

      <motion.div className="detail-right" initial={{ opacity: 0, x: -120, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
        <div className="cube-stage">
          <Cube3D state={player.state} animation={player.animation} size={260} mask={maskForStage(c.stage)} interactive />
        </div>
        <div className="progress" style={{ maxWidth: 260 }}>
          <div style={{ width: `${player.total ? (player.index / player.total) * 100 : 0}%` }} />
        </div>
        <div className="player-controls">
          <button className="btn icon" onClick={player.reset} title="Reset to the case (Alt + R)" aria-label="Reset to the case" aria-keyshortcuts="Alt+r">
            <IconReset /><ShortcutKey letter="R" />
          </button>
          <button className="btn primary" aria-keyshortcuts="Alt+p" onClick={player.playing ? player.pause : player.play}>
            {player.playing ? <IconPause /> : <IconPlay />}
            {player.playing ? "Pause" : player.index >= player.total ? "Replay" : "Play"} <ShortcutKey letter="P" />
          </button>
          <button className="btn icon" onClick={player.stepForward} disabled={player.playing || player.index >= player.total} title="Next move (Alt + J)" aria-label="Next move" aria-keyshortcuts="Alt+j">
            <IconStep /><ShortcutKey letter="J" />
          </button>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            Showing
          </div>
          <AlgText alg={displayAlg(active)} />
        </div>
        <p className="muted" style={{ fontSize: 12, textAlign: "center", margin: 0 }}>
          Drag the cube to rotate it.
        </p>
      </motion.div>
    </motion.div>
  );
}

export const Kpi = memo(function Kpi({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={value} className={`value ${small ? "small" : ""}`} initial={{ opacity: 0, y: 8, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.94 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}>
          {value}
        </motion.div>
      </AnimatePresence>
    </div>
  );
});
