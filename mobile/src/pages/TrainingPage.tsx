import { practiceSummary, trainingSessionRows } from "../../../src/client/lib/practiceSummary";
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { effective, fmtSolve, fmtTime } from "../../../src/client/lib/format";
import { learningGoalMet, pendingCases } from "../../../src/client/lib/learningGoal";
import { EMPTY_TRAINING_HISTORY, trainingHistoryReducer } from "../../../src/client/lib/trainingHistory";
import { applyAlg, combineAuf, compensateAuf, randomAuf, solved } from "../../../src/shared/cube";
import { puzzleInfo, type PracticeContext } from "../../../src/shared/puzzles";
import type { CaseDto, SolveDto } from "../../../src/shared/types";
import { api, localChanged } from "../api";
import { casesAtom, cubeSwitchLockedAtom, deletedSolveIdAtom, learnedCaseIdsAtom, learningGoalAtom, puzzleAtom, randomAufAtom, routeAtom, selectedCaseIdsAtom, setsAtom, solveModeAtom, statsVersionAtom, updatedSolveAtom, userAtom } from "../state";
import { useTheme } from "../theme";
import { useTimer } from "../hooks/useTimer";
import { useLayout } from "../hooks/useLayout";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { executableAlg, maskForStage, shortId } from "../lib/caseState";
import { ensureLaunchSession, launchSessionId } from "../lib/launchSession";
import { AlgText } from "../components/AlgText";
import { CaseDiagram } from "../components/CaseDiagram";
import { CaseSelector } from "../components/CaseSelector";
import { IconBack, IconCheck, IconComment, IconEye, IconGrid, IconNext, IconShuffle, IconTimer, IconUndo } from "../components/icons";
import { PanelButton, PracticePanel, ToolbarAction } from "../components/PracticePanel";
import { Notice, PracticeContent, PracticeDock, PracticeReadout, TimerChrome, TimerSlot, TouchArea } from "../components/Practice";
import { LastSolveActions, SolveRow } from "../components/SolveMenus";
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { viewForStage } from "../../../src/shared/cubeDiagram";
import { StopSurface, TimerSurface } from "../components/TimerSurface";
import { useDailyLearning } from "../hooks/useDailyLearning";
import { Select } from "../components/Select";
import { LEARNING_TRACKS, type LearningMode } from "../../../src/client/lib/dailyLearning";
import { Caption, Kpi, MiniBtn, Muted, mono } from "../components/ui";
import { styles as base } from "./PlaygroundPage";

export function TrainingPage() {
  const puzzle = useAtomValue(puzzleAtom);
  const mode = useAtomValue(solveModeAtom);
  const user = useAtomValue(userAtom);
  return <TrainingSession key={`${puzzle}:${mode}:${user?.id}`} />;
}

function TrainingSession() {
  const t = useTheme();
  const layout = useLayout();
  const puzzle = useAtomValue(puzzleAtom);
  const cube = puzzleInfo(puzzle).cubeSize;
  const supportsAuf = !!cube;
  const solveMode = useAtomValue(solveModeAtom);
  const lockCube = useSetAtom(cubeSwitchLockedAtom);
  const cases = useAtomValue(casesAtom);
  const sets = useAtomValue(setsAtom);
  const [freeSelected, setSelected] = useAtom(selectedCaseIdsAtom);
  const daily = useDailyLearning();
  const learning = daily.mode !== "practice";
  const selected = useMemo(() => learning ? daily.assignment ? [daily.assignment.caseId] : [] : freeSelected, [learning, daily.assignment?.caseId, freeSelected]);
  const [learnedIds, toggleLearned] = useAtom(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [useAuf, setUseAuf] = useAtom(randomAufAtom);
  const [route, setRoute] = useAtom(routeAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const byId = useMemo(() => new Map(cases.map(c => [c.id, c])), [cases]);
  const selectedCases = useMemo(() => selected.map(id => byId.get(id)).filter((c): c is CaseDto => !!c), [selected, byId]);
  const [caseHistory, navigateCase] = useReducer(trainingHistoryReducer, EMPTY_TRAINING_HISTORY);
  const entry = caseHistory.entries[caseHistory.index] ?? null;
  const current = entry && selected.includes(entry.c.id) ? entry : null;
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [solves, setSolves] = useState<SolveDto[]>([]);
  const deletedSolveId = useAtomValue(deletedSolveIdAtom);
  useEffect(() => { if (deletedSolveId !== null) setSolves(list => list.filter(solve => solve.id !== deletedSolveId)); }, [deletedSolveId]);
  const updatedSolve = useAtomValue(updatedSolveAtom);
  useEffect(() => { if (updatedSolve) setSolves(list => list.map(solve => solve.id === updatedSolve.id ? updatedSolve : solve)); }, [updatedSolve]);
  // The time just recorded keeps its buttons under the timer until the next attempt or its deletion.
  const [lastSolveId, setLastSolveId] = useState<number | null>(null);
  const wide = layout.wide;
  const [showSelector, setShowSelector] = useState(wide);
  const [showTimes, setShowTimes] = useState(wide);
  useEffect(() => { setShowSelector(wide); setShowTimes(wide); }, [wide]);
  // The session belongs to this launch; the panel only lists its solves (see lib/launchSession).
  const context: PracticeContext = { puzzle, solveMode, scrambleType: "case" };
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const session = launchSessionId("training", context);
      if (session === null) { if (active) setSolves([]); return; }
      const rows = await api.solves("training", 1000, puzzle, { solveMode, scrambleType: "case" });
      if (active) setSolves(rows.filter(s => s.session_id === session).reverse());
    };
    void refresh();
    const unsubscribe = localChanged.on(() => void refresh());
    return () => { active = false; unsubscribe(); };
  }, []);

  const pick = useCallback((pool: CaseDto[]) => {
    navigateCase({ type: "next", pool, sample: Math.random(), auf: useAuf && supportsAuf ? randomAuf() : "" });
    setRevealed(false);
  }, [useAuf, supportsAuf]);
  useEffect(() => { if (!current || !selected.includes(current.c.id)) pick(selectedCases); }, [selectedCases, pick]);
  useEffect(() => { if (route.page === "training" && route.autostart) { daily.setMode("practice"); setRoute({ page: "training" }); } }, []);
  // Celebrate once every selected case is learned, whether marked here or from the case details.
  const store = useStore();
  const [celebratedAt, setCelebratedAt] = useState(0);
  useEffect(() => {
    const previous = store.get(learningGoalAtom);
    if (previous?.puzzle === puzzle && learningGoalMet(previous.pending, selected, learned)) setCelebratedAt(Date.now());
    store.set(learningGoalAtom, { puzzle, pending: pendingCases(selected, learned) });
  }, [store, puzzle, selected, learned]);

  const ensureSession = () => ensureLaunchSession("training", context, selected);
  const onStop = useCallback(async (ms: number) => {
    if (!current) return;
    setSaving(true);
    try {
      const sessionId = await ensureSession();
      const setupText = cube ? combineAuf(current.c.setup, current.auf) : current.c.setup;
      const solve = await api.addSolve({ sessionId, caseId: current.c.id, timeMs: ms, scramble: setupText, puzzle, solveMode, scrambleType: "case" });
      setSolves(s => [...s.filter(item => item.id !== solve.id), solve]);
      setLastSolveId(solve.id);
      bumpStats(v => v + 1);
      pick(selectedCases);
    } finally { setSaving(false); }
  }, [current, selectedCases, pick]);
  const timer = useTimer({ onStop, canStart: !saving && !!current });

  const remove = async (id: number) => { await api.deleteSolve(id); setSolves(s => s.filter(x => x.id !== id)); bumpStats(v => v + 1); };
  const undoLast = () => { const last = solves.at(-1); if (last) void remove(last.id); };
  const lastSolve = lastSolveId === null ? null : solves.find(solve => solve.id === lastSolveId) ?? null;
  const primary = current?.c.algorithms[0];
  const shownSetup = current ? (cube ? combineAuf(current.c.setup, current.auf) : current.c.setup) : "";
  // The picture must show the cube exactly as it is after the displayed setup, random U turn included.
  const shownState = useMemo(() => cube && shownSetup ? applyAlg(solved(cube), shownSetup) : null, [cube, shownSetup]);
  const shownAlgorithm = primary && current ? (cube ? compensateAuf(executableAlg(primary), current.auf) : executableAlg(primary)) : "";
  const busy = saving || timer.phase === "running" || timer.phase === "holding" || timer.phase === "ready";
  const running = timer.phase === "running";
  useEffect(() => { lockCube(busy || !!timer.saveError); return () => lockCube(false); }, [busy, timer.saveError, lockCube]);
  const previousCase = () => {
    const previous = caseHistory.entries[caseHistory.index - 1];
    if (busy || learning || !previous) return;
    setSelected(ids => ids.includes(previous.c.id) ? ids : [...ids, previous.c.id]);
    navigateCase({ type: "previous" }); setRevealed(false); timer.reset();
  };
  const nextCase = () => { if (!busy) { pick(selectedCases); timer.reset(); } };
  const summary = practiceSummary(solves);
  const grouped = layout.phone && !layout.landscape;
  const docked = layout.phone || layout.landscape;
  const cubeSize = layout.landscape ? 72 : layout.short ? 96 : layout.phone ? 112 : 150;
  const setupSize = layout.short ? 16 : layout.phone ? 17 : Math.max(19, Math.min(25, layout.width * 0.018));
  const timerSize = layout.short ? Math.max(48, Math.min(layout.height * 0.09, 72)) : layout.phone ? Math.max(56, Math.min(layout.width * 0.15, 84)) : Math.max(60, Math.min(layout.width * 0.07, 108));
  const iconColor = t.text2;
  const currentLearned = !!current && learned.has(current.c.id);

  const caseActions = current && (<View style={[styles.caseActions, docked && { marginTop: 0, flexShrink: 1 }]}>
    {primary && <Pressable disabled={busy} accessibilityRole="button" accessibilityLabel={revealed ? "Hide solution" : "Show solution"} onPress={() => setRevealed(v => !v)} style={({ pressed }) => [styles.reveal, docked && { minHeight: 44, paddingHorizontal: 8 }, { backgroundColor: pressed ? t.hover : "transparent", opacity: busy ? 0.45 : 1 }]}><IconEye size={14} color={t.readableMuted} /><Text style={{ color: t.readableMuted, fontSize: 13, fontWeight: "600" }}>{revealed ? (docked ? "Hide" : "Hide solution") : (docked ? "Solution" : "Show solution")}</Text></Pressable>}
    <Pressable disabled={busy} onPress={() => toggleLearned(current.c.id)} accessibilityRole="button" accessibilityState={{ selected: currentLearned }} accessibilityLabel={`${current.c.id} learned`} style={({ pressed }) => [styles.reveal, docked && { minHeight: 44, paddingHorizontal: 8 }, { backgroundColor: pressed ? t.hover : "transparent", opacity: busy ? 0.45 : 1 }]}>
      {currentLearned && <IconCheck size={14} color={t.good} />}
      <Text style={{ color: currentLearned ? t.good : t.readableMuted, fontSize: 13, fontWeight: "600" }}>{currentLearned ? "Learned" : (docked ? "Learn" : "Mark learned")}</Text>
    </Pressable>
  </View>);

  const learningSelect = puzzle === "333" && <Select<LearningMode> value={daily.mode} accessibilityLabel="Learning mode" options={[{ value: "practice", label: "Free practice" }, ...LEARNING_TRACKS.map(value => ({ value, label: `Learn ${value}` }))]} onChange={mode => { daily.setMode(mode); setShowSelector(false); timer.reset(); }} disabled={busy || !!timer.saveError} flat="toolbar" />;

  return <View style={base.page}>
    <View style={[base.workspace, wide && base.workspaceWide]}>
      {learning ? (wide ? <View style={{ flex: 1 }} /> : null) : <PracticePanel open={showSelector} wide={wide} side="left" title="Cases" icon={<IconGrid size={15} color={iconColor} />} count={selectedCases.length} disabled={busy} onOpen={() => setShowSelector(true)} onClose={() => setShowSelector(false)}>
        <CaseSelector cases={cases} sets={sets} selected={selected} onChange={setSelected} defaultExpanded={wide} onOpenCase={() => setShowSelector(false)} />
      </PracticePanel>}
      <TouchArea timer={timer} enabled={!!current && !saving && !timer.saveError} style={[base.center, wide && { flex: 2.6 }]}>
        {!docked && <TimerChrome hidden={running} style={[base.toolbar, { paddingHorizontal: layout.pagePadding, paddingTop: layout.phone ? 8 : 12 }]}>
          <View style={[base.toolbarGroup, { flex: 1 }]}>{learningSelect}{!learning && !wide && !showSelector && <PanelButton title="Cases" icon={<IconGrid size={15} color={iconColor} />} count={selectedCases.length} disabled={busy} onPress={() => setShowSelector(true)} phone={layout.phone} />}</View>
          <View style={[base.toolbarGroup, { justifyContent: "center" }]}>{supportsAuf && <ToolbarAction icon={<IconShuffle size={15} color={useAuf ? t.accent : iconColor} />} label="Random AUF" pressed={useAuf} disabled={busy} onPress={() => setUseAuf(v => !v)} phone={layout.phone} />}</View>
          <View style={[base.toolbarGroup, { flex: 1, justifyContent: "flex-end" }]}>{!wide && !showTimes && <PanelButton title="Times" icon={<IconTimer size={15} color={iconColor} />} disabled={busy} onPress={() => setShowTimes(true)} phone={layout.phone} />}</View>
        </TimerChrome>}
        <Notice at={celebratedAt} hidden={running} top={docked ? 8 : 56} icon={<IconCheck size={14} color={t.good} />} message="Well done! Every selected case is learned." />
        <View style={[base.stack, layout.landscape && base.stackLandscape, docked && { paddingTop: layout.landscape ? 8 : 16, paddingBottom: layout.landscape ? 8 : 16 }, { paddingHorizontal: layout.pagePadding }]}>
          {current ? <TimerChrome hidden={running} exit="up" style={[styles.trainingCase, layout.landscape && base.landscapeLeft, grouped && base.grouped]}>
            <PracticeContent revealEnd={revealed}>
            <View style={styles.heading}>
              {!docked && !learning && <Pressable disabled={busy || caseHistory.index <= 0} onPress={previousCase} accessibilityLabel="Previous case" style={({ pressed }) => [styles.caseNav, { marginRight: 6, backgroundColor: pressed ? t.hover : "transparent", opacity: busy || caseHistory.index <= 0 ? 0.45 : 1 }]}><IconBack size={16} color={t.readableMuted} /></Pressable>}
              <Pressable disabled={busy} onPress={() => setRoute({ page: "algorithms", caseId: current.c.id })} accessibilityLabel="Open case details" style={styles.caseHeading}>
                <Text style={[styles.caseTitle, { color: t.text, fontSize: layout.phone ? 18 : 22, textDecorationColor: t.readableMuted }]}>{current.c.id}</Text>
                <Muted size={13} style={{ textAlign: "center" }}>{learning ? daily.status : current.c.name !== current.c.id ? current.c.name : current.c.group}</Muted>
              </Pressable>
              {!docked && !learning && <Pressable disabled={busy} onPress={nextCase} accessibilityLabel="Next case" style={({ pressed }) => [styles.caseNav, { marginLeft: 6, backgroundColor: pressed ? t.hover : "transparent", opacity: busy ? 0.45 : 1 }]}><IconNext size={16} color={t.readableMuted} /></Pressable>}
            </View>
            <View style={styles.setup}>
              <View style={styles.cubeShadow}>{shownState ? <StaticCubeSvg state={shownState} size={cubeSize} mask={maskForStage(current.c.stage)} view={viewForStage(current.c.stage)} /> : <CaseDiagram c={current.c} size={cubeSize} />}</View>
              <View style={{ width: "100%", maxWidth: 620, alignItems: "center" }}>
                <Caption style={{ marginBottom: 8 }}>Setup</Caption>
                <AlgText alg={shownSetup} size={setupSize} lineHeight={setupSize * 1.7} wordSpacing={layout.phone ? 1 : 0} style={{ textAlign: "center", paddingHorizontal: layout.phone ? 12 : 0 }} />
              </View>
            </View>
            {primary && revealed && <View style={[styles.solution, { borderTopColor: t.line }]}><Caption style={{ marginBottom: 8 }}>Solution</Caption><AlgText alg={shownAlgorithm} size={layout.phone ? 15 : 18} style={{ textAlign: "center" }} /></View>}
            {!docked && caseActions}
            </PracticeContent>
          </TimerChrome> : <TimerChrome hidden={running} exit="up" style={[styles.empty, layout.landscape && base.landscapeLeft, grouped && base.grouped]}>
            <IconGrid size={34} color={t.accent} />
            <Text style={{ color: t.text, fontSize: 22, fontWeight: "700", marginTop: 10 }}>{learning ? "Track complete" : "Choose your cases"}</Text>
            <Muted style={{ marginTop: 6, textAlign: "center" }}>{learning ? daily.status : "Open Cases and select the algorithms to practise."}</Muted>
          </TimerChrome>}
          <PracticeReadout landscape={layout.landscape}>
          <TimerSlot running={running} style={base.timerSlot}><TimerSurface reserveActions={!docked} timer={timer} disabled={!current || saving} fontSize={timerSize} short={layout.short} actions={lastSolve && !saving ? <LastSolveActions solve={lastSolve} compact={layout.short} /> : null} /></TimerSlot>
          <TimerChrome hidden={running} exit="down" style={[base.stats, (layout.landscape || layout.short || grouped) && { flex: 0 }, { gap: layout.phone ? 14 : 40 }]}>
            <Kpi center label="Solves" value={String(solves.length)} valueSize={layout.phone ? 18 : 22} />
            <Kpi center label="Best" value={fmtTime(summary.best)} valueSize={layout.phone ? 18 : 22} />
            <Kpi center label="Mean" value={fmtTime(summary.mean)} valueSize={layout.phone ? 18 : 22} />
          </TimerChrome>
          </PracticeReadout>
        </View>
        {docked && <PracticeDock hidden={running}>
          <View style={base.dockLastSolve}>{lastSolve && !saving && <LastSolveActions solve={lastSolve} compact />}</View>
          {current && <View style={base.dockRow}>
            {!learning && <Pressable disabled={busy || caseHistory.index <= 0} onPress={previousCase} accessibilityRole="button" accessibilityLabel="Previous case" style={({ pressed }) => [styles.caseNav, styles.dockCaseNav, { backgroundColor: pressed ? t.hover : "transparent", opacity: busy || caseHistory.index <= 0 ? 0.45 : 1 }]}><IconBack size={16} color={t.text2} /></Pressable>}
            {caseActions}
            {!learning && <Pressable disabled={busy} onPress={nextCase} accessibilityRole="button" accessibilityLabel="Next case" style={({ pressed }) => [styles.caseNav, styles.dockCaseNav, { backgroundColor: pressed ? t.hover : "transparent", opacity: busy ? 0.45 : 1 }]}><IconNext size={16} color={t.text2} /></Pressable>}
          </View>}
          <View style={[base.dockRow, { flexWrap: "wrap" }]}>
            {learningSelect}
            {!learning && <PanelButton title="Cases" icon={<IconGrid size={15} color={iconColor} />} count={selectedCases.length} disabled={busy} onPress={() => setShowSelector(true)} phone />}
            {supportsAuf && <ToolbarAction icon={<IconShuffle size={15} color={useAuf ? t.accent : iconColor} />} label="AUF" pressed={useAuf} disabled={busy} onPress={() => setUseAuf(v => !v)} phone />}
            <PanelButton title="Times" icon={<IconTimer size={15} color={iconColor} />} disabled={busy} onPress={() => setShowTimes(true)} phone />
          </View>
        </PracticeDock>}
      </TouchArea>
      <PracticePanel open={showTimes} wide={wide} side="right" title="Session" icon={<IconTimer size={15} color={iconColor} />} disabled={busy} onOpen={() => setShowTimes(true)} onClose={() => setShowTimes(false)}>
        <TimesPanel selectedCases={selectedCases} solves={solves} onUndo={undoLast} />
      </PracticePanel>
    </View>
    <StopSurface timer={timer} />
  </View>;
}

function TimesPanel({ selectedCases, solves, onUndo }: { selectedCases: CaseDto[]; solves: SolveDto[]; onUndo: () => void }) {
  const t = useTheme();
  const { navSpace } = useLayout();
  const scroll = usePreservedScroll(`training-times:${selectedCases[0]?.puzzle_id ?? selectedCases[0]?.cube_size ?? 3}`);
  const ordered = useMemo(() => trainingSessionRows(selectedCases, solves), [selectedCases, solves]);
  const summary = practiceSummary(solves);
  return <View style={base.panel}>
    <View style={base.panelHeader}>
      <Muted size={13} style={{ flexShrink: 1 }}>{solves.length} solve{solves.length === 1 ? "" : "s"}{solves.length > 0 && ` · best ${fmtTime(summary.best)} · mean ${fmtTime(summary.mean)}`}</Muted>
      <MiniBtn icon={<IconUndo size={13} color={t.readableMuted} />} label="Undo" onPress={onUndo} disabled={!solves.length} />
    </View>
    <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 4, paddingRight: 4, paddingBottom: navSpace }}>
      {ordered.map(({ c, solves: list, best: b, mean: average, validCount }) => {
        // The case is named under its picture; beside it, its times as badges or a plain dash while it has none.
        return <View key={c.id} style={styles.sessionCase}>
          <View style={styles.sessionCube}>
            <CaseDiagram c={c} size={44} />
            <Text numberOfLines={1} style={{ color: t.text2, fontSize: 11, fontWeight: "600" }}>{shortId(c)}</Text>
          </View>
          {/* As tall as the picture at least, so the dash or the times centre on it rather than on the name. */}
          {list.length === 0 ? <View style={styles.sessionBody}><View style={[styles.sessionDash, { backgroundColor: t.muted, opacity: 0.6 }]} /></View> : <View style={styles.sessionBody}>
            {/* The best time is the highlighted badge; only the mean needs words, once there is more than one time. */}
            {validCount > 1 && <Text numberOfLines={1} style={[mono(t, 11), { color: t.readableMuted }]}>mean {fmtTime(average)}</Text>}
            <View style={styles.sessionTimes}>
              {[...list].reverse().map(s => { const time = effective(s.time_ms, s.penalty); const isBest = time !== null && time === b; return <SolveRow key={s.id} solve={s} style={[styles.sessionTime, { backgroundColor: isBest ? t.accentSoft : t.surface2 }]}><Text style={[mono(t, 12, isBest ? "600" : "500"), { color: s.penalty === "dnf" ? t.danger : isBest ? t.accent : t.text }]}>{fmtSolve(s.time_ms, s.penalty)}</Text>{s.comment ? <IconComment size={11} color={t.readableMuted} /> : null}</SolveRow>; })}
            </View>
          </View>}
        </View>;
      })}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  dockCaseNav: { width: 44, height: 44 },
  trainingCase: { width: "100%", flex: 1, justifyContent: "flex-end", alignItems: "center" },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: 10 },
  caseHeading: { alignItems: "center", gap: 2, flexShrink: 1 },
  caseNav: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  caseTitle: { fontWeight: "700", textDecorationLine: "underline" },
  setup: { alignItems: "center", gap: 10, marginTop: 12, width: "100%" },
  cubeShadow: { shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 8 } },
  solution: { width: "100%", maxWidth: 600, marginTop: 12, paddingTop: 12, borderTopWidth: 1, alignItems: "center" },
  caseActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 4 },
  reveal: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 10 },
  empty: { alignItems: "center", paddingVertical: 20, paddingHorizontal: 12, flex: 1, justifyContent: "flex-end" },
  sessionCase: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 10, paddingHorizontal: 2 },
  sessionBody: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center", gap: 7 },
  sessionCube: { width: 60, alignItems: "center", gap: 5 },
  sessionDash: { width: 14, height: 2, borderRadius: 1 },
  sessionTimes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sessionTime: { flexDirection: "row", alignItems: "center", gap: 4, height: 24, paddingHorizontal: 7, borderRadius: 6 },
});
