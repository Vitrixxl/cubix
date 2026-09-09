import { memo, useEffect, useId, useMemo, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { unwrap } from "jotai/utils";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { animationsEnabledAtom, collapsedAlgorithmGroupsAtom, trainedOnlyAtom, casesAtom, routeAtom, selectedCaseIdsAtom, setByStageAtom, setsAtom, stageAtom, statsAtom } from "../state";
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
  const [trainedOnly, setTrainedOnly] = useAtom(trainedOnlyAtom);
  const [collapsed, setCollapsed] = useAtom(collapsedAlgorithmGroupsAtom);
  const groupId = useId();
  const animationsEnabled = useAtomValue(animationsEnabledAtom);
  const reducedMotion = useReducedMotion();
  const foldTransition = { duration: animationsEnabled && !reducedMotion ? .22 : 0, ease: [.22, 1, .36, 1] as const };
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
  const setCases = useMemo(() => cases.filter(c => c.set === activeSet?.id), [cases, activeSet?.id]);
  const trainedCases = useMemo(() => setCases.filter(c => (stats.get(c.id)?.count ?? 0) > 0), [setCases, stats]);
  const visible = trainedOnly ? trainedCases : setCases;
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
              <div className="catalog-toolbar">
                <p className="subtle">{activeSet?.description}</p>
                <button type="button" className="catalog-trained-filter" aria-pressed={trainedOnly} onClick={() => setTrainedOnly(value => !value)}>
                  <IconTimer /><span>Trained only</span><span className="count">{trainedCases.length} / {setCases.length}</span>
                </button>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={activeSet?.id} className="case-list" variants={listVariants} initial="hidden" animate="show" exit="exit">
                  {groups.map(([group, list]) => {
                    const key = `${activeSet?.id}:${group}`;
                    const expanded = !collapsed[key];
                    const contentId = `${groupId}-${encodeURIComponent(key)}`;
                    return <section key={group} aria-label={group}>
                      <motion.div className="group-title catalog-group-title" variants={itemVariants}>
                        <h2><button type="button" className="catalog-group-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => setCollapsed(previous => ({ ...previous, [key]: !previous[key] }))}>
                          <motion.svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" initial={false} animate={{ rotate: expanded ? 0 : -90 }} transition={foldTransition}><path d="m6 9 6 6 6-6" /></motion.svg>
                          <span>{group}</span><span className="count">{list.length}</span>
                        </button></h2>
                        <button type="button" className="btn ghost small group-train" onClick={() => trainAll(list)} title={`Train the ${list.length} cases of ${group}`}>
                          <IconTimer /> Train all
                        </button>
                      </motion.div>
                      <div id={contentId} inert={!expanded}>
                        <AnimatePresence initial={false}>{expanded && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={foldTransition} style={{ overflow: "hidden" }}>
                          <motion.div className="grid-cases" variants={listVariants} initial="hidden" animate="show">
                            {list.map(c => <CaseCard key={c.id} c={c} stats={stats.get(c.id)} onOpen={() => setRoute({ page: "algorithms", caseId: c.id })} />)}
                          </motion.div>
                        </motion.div>}</AnimatePresence>
                      </div>
                    </section>;
                  })}
                  {!groups.length && <div className="empty"><p>No trained cases in this set yet.</p><button type="button" className="btn ghost small" onClick={() => setTrainedOnly(false)}>Show all cases</button></div>}

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
  const [activePane, setActivePane] = useState<"algorithms" | "statistics">("algorithms");
  const paneId = useId();
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
    <motion.div className="detail case-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
      <div className="case-detail-heading">
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

      </div>
      <div className="case-pane-tabs" aria-label="Case content">
        <button type="button" aria-pressed={activePane === "algorithms"} aria-controls={`${paneId}-algorithms`} onClick={() => setActivePane("algorithms")}>Algorithms</button>
        <button type="button" aria-pressed={activePane === "statistics"} aria-controls={`${paneId}-statistics`} onClick={() => setActivePane("statistics")}>Statistics</button>
      </div>
      <div className="case-content-panels" data-active-pane={activePane}>
        <section id={`${paneId}-algorithms`} className="case-scroll-pane case-algorithms-pane" aria-label="Case algorithms" tabIndex={0}>
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

      <motion.div className="case-player" initial={{ opacity: 0, x: 0, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
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
        </section>
        <section id={`${paneId}-statistics`} className="case-scroll-pane case-statistics-pane" aria-label="Case statistics" tabIndex={0}>
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
        </section>
      </div>
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
