import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { best, effective, fmtSolve, fmtTime, mean } from "../../../src/client/lib/format";
import { EMPTY_TRAINING_HISTORY, trainingHistoryReducer } from "../../../src/client/lib/trainingHistory";
import { applyAlg, combineAuf, compensateAuf, randomAuf, solved } from "../../../src/shared/cube";
import { puzzleInfo, type PracticeContext } from "../../../src/shared/puzzles";
import type { CaseDto, SolveDto } from "../../../src/shared/types";
import { api, localChanged } from "../api";
import { casesAtom, cubeSwitchLockedAtom, deletedSolveIdAtom, puzzleAtom, randomAufAtom, routeAtom, selectedCaseIdsAtom, setsAtom, solveModeAtom, statsVersionAtom } from "../state";
import { useTheme } from "../theme";
import { useTimer } from "../hooks/useTimer";
import { useLayout } from "../hooks/useLayout";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { executableAlg, maskForStage, shortId } from "../lib/caseState";
import { ensureLaunchSession, launchSessionId } from "../lib/launchSession";
import { AlgText } from "../components/AlgText";
import { CaseDiagram } from "../components/CaseDiagram";
import { CaseSelector } from "../components/CaseSelector";
import { IconBack, IconEye, IconGrid, IconShuffle, IconSkip, IconTimer, IconUndo } from "../components/icons";
import { PanelButton, PracticePanel, ToolbarAction } from "../components/PracticePanel";
import { PracticeContent, PracticeReadout, TimerChrome, TimerSlot, TouchArea } from "../components/Practice";
import { SolveRow } from "../components/SolveMenus";
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { StopSurface, TimerSurface } from "../components/TimerSurface";
import { Caption, Kpi, MiniBtn, Muted, mono } from "../components/ui";
import { styles as base } from "./PlaygroundPage";

export function TrainingPage() {
  const puzzle = useAtomValue(puzzleAtom);
  const mode = useAtomValue(solveModeAtom);
  return <TrainingSession key={`${puzzle}:${mode}`} />;
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
  const [selected, setSelected] = useAtom(selectedCaseIdsAtom);
  const [useAuf, setUseAuf] = useAtom(randomAufAtom);
  const [route, setRoute] = useAtom(routeAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const byId = useMemo(() => new Map(cases.map(c => [c.id, c])), [cases]);
  const selectedCases = useMemo(() => selected.map(id => byId.get(id)).filter((c): c is CaseDto => !!c), [selected, byId]);
  const [caseHistory, navigateCase] = useReducer(trainingHistoryReducer, EMPTY_TRAINING_HISTORY);
  const current = caseHistory.entries[caseHistory.index] ?? null;
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [solves, setSolves] = useState<SolveDto[]>([]);
  const deletedSolveId = useAtomValue(deletedSolveIdAtom);
  useEffect(() => { if (deletedSolveId !== null) setSolves(list => list.filter(solve => solve.id !== deletedSolveId)); }, [deletedSolveId]);
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
  useEffect(() => { if (route.page === "training" && route.autostart) setRoute({ page: "training" }); }, []);

  const ensureSession = () => ensureLaunchSession("training", context, selected);
  const onStop = useCallback(async (ms: number) => {
    if (!current) return;
    setSaving(true);
    try {
      const sessionId = await ensureSession();
      const setupText = cube ? combineAuf(current.c.setup, current.auf) : current.c.setup;
      const solve = await api.addSolve({ sessionId, caseId: current.c.id, timeMs: ms, scramble: setupText, puzzle, solveMode, scrambleType: "case" });
      setSolves(s => [...s.filter(item => item.id !== solve.id), solve]);
      bumpStats(v => v + 1);
      pick(selectedCases);
    } finally { setSaving(false); }
  }, [current, selectedCases, pick]);
  const timer = useTimer({ onStop, canStart: !saving && !!current });

  const remove = async (id: number) => { await api.deleteSolve(id); setSolves(s => s.filter(x => x.id !== id)); bumpStats(v => v + 1); };
  const undoLast = () => { const last = solves.at(-1); if (last) void remove(last.id); };
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
    if (busy || !previous) return;
    setSelected(ids => ids.includes(previous.c.id) ? ids : [...ids, previous.c.id]);
    navigateCase({ type: "previous" }); setRevealed(false); timer.reset();
  };
  const nextCase = () => { if (!busy) { pick(selectedCases); timer.reset(); } };
  const times = solves.map(solve => effective(solve.time_ms, solve.penalty));
  const grouped = layout.phone && !layout.landscape;
  const cubeSize = layout.landscape ? 72 : layout.short ? 96 : layout.phone ? 112 : 150;
  const setupSize = layout.short ? 16 : layout.phone ? 17 : Math.max(19, Math.min(25, layout.width * 0.018));
  const timerSize = layout.short ? Math.max(48, Math.min(layout.height * 0.09, 72)) : layout.phone ? Math.max(56, Math.min(layout.width * 0.15, 84)) : Math.max(60, Math.min(layout.width * 0.07, 108));
  const iconColor = t.text2;

  return <View style={base.page}>
    <View style={[base.workspace, wide && base.workspaceWide]}>
      <PracticePanel open={showSelector} wide={wide} side="left" title="Cases" icon={<IconGrid size={15} color={iconColor} />} count={selectedCases.length} disabled={busy} onOpen={() => setShowSelector(true)} onClose={() => setShowSelector(false)}>
        <CaseSelector cases={cases} sets={sets} selected={selected} onChange={setSelected} defaultExpanded={wide} onOpenCase={() => setShowSelector(false)} />
      </PracticePanel>
      <TouchArea timer={timer} enabled={!!current && !saving && !timer.saveError} style={[base.center, wide && { flex: 2.6 }]}>
        <TimerChrome hidden={running} style={[base.toolbar, { paddingHorizontal: layout.pagePadding, paddingTop: layout.phone ? 8 : 12 }]}>
          <View style={[base.toolbarGroup, { flex: 1 }]}>{!wide && !showSelector && <PanelButton title="Cases" icon={<IconGrid size={15} color={iconColor} />} count={selectedCases.length} disabled={busy} onPress={() => setShowSelector(true)} phone={layout.phone} />}</View>
          <View style={[base.toolbarGroup, { justifyContent: "center" }]}>{supportsAuf && <ToolbarAction icon={<IconShuffle size={15} color={useAuf ? t.accent : iconColor} />} label="Random AUF" pressed={useAuf} disabled={busy} onPress={() => setUseAuf(v => !v)} phone={layout.phone} />}</View>
          <View style={[base.toolbarGroup, { flex: 1, justifyContent: "flex-end" }]}>{!wide && !showTimes && <PanelButton title="Times" icon={<IconTimer size={15} color={iconColor} />} disabled={busy} onPress={() => setShowTimes(true)} phone={layout.phone} />}</View>
        </TimerChrome>
        <View style={[base.stack, layout.landscape && base.stackLandscape, layout.phone && !layout.landscape && { paddingTop: 52, paddingBottom: 88 }, { paddingHorizontal: layout.pagePadding }]}>
          {current ? <TimerChrome hidden={running} exit="up" style={[styles.trainingCase, layout.landscape && base.landscapeLeft, grouped && base.grouped]}>
            <PracticeContent revealEnd={revealed}>
            <View style={styles.heading}>
              <Pressable disabled={busy || caseHistory.index <= 0} onPress={previousCase} accessibilityLabel="Previous case" style={({ pressed }) => [styles.caseNav, { marginRight: 6, backgroundColor: pressed ? t.hover : "transparent", opacity: busy || caseHistory.index <= 0 ? 0.45 : 1 }]}><IconBack size={16} color={t.readableMuted} /></Pressable>
              <Pressable disabled={busy} onPress={() => setRoute({ page: "algorithms", caseId: current.c.id })} accessibilityLabel="Open case details" style={styles.caseHeading}>
                <Text style={[styles.caseTitle, { color: t.text, fontSize: layout.phone ? 18 : 22, textDecorationColor: t.readableMuted }]}>{current.c.id}</Text>
                <Muted size={13} style={{ textAlign: "center" }}>{current.c.name !== current.c.id ? current.c.name : current.c.group}</Muted>
              </Pressable>
              <Pressable disabled={busy} onPress={nextCase} accessibilityLabel="Next case" style={({ pressed }) => [styles.caseNav, { marginLeft: 6, backgroundColor: pressed ? t.hover : "transparent", opacity: busy ? 0.45 : 1 }]}><IconSkip size={16} color={t.readableMuted} /></Pressable>
            </View>
            <View style={styles.setup}>
              <View style={styles.cubeShadow}>{shownState ? <StaticCubeSvg state={shownState} size={cubeSize} mask={maskForStage(current.c.stage)} /> : <CaseDiagram c={current.c} size={cubeSize} />}</View>
              <View style={{ width: "100%", maxWidth: 620, alignItems: "center" }}>
                <Caption style={{ marginBottom: 8 }}>Setup</Caption>
                <AlgText alg={shownSetup} size={setupSize} lineHeight={setupSize * 1.7} wordSpacing={layout.phone ? 1 : 0} style={{ textAlign: "center", paddingHorizontal: layout.phone ? 12 : 0 }} />
              </View>
            </View>
            {primary && revealed && <View style={[styles.solution, { borderTopColor: t.line }]}><Caption style={{ marginBottom: 8 }}>Solution</Caption><AlgText alg={shownAlgorithm} size={layout.phone ? 15 : 18} style={{ textAlign: "center" }} /></View>}
            {primary && <Pressable disabled={busy} onPress={() => setRevealed(v => !v)} style={({ pressed }) => [styles.reveal, { backgroundColor: pressed ? t.hover : "transparent", opacity: busy ? 0.45 : 1 }]}><IconEye size={14} color={t.readableMuted} /><Text style={{ color: t.readableMuted, fontSize: 13, fontWeight: "600" }}>{revealed ? "Hide solution" : "Show solution"}</Text></Pressable>}
            </PracticeContent>
          </TimerChrome> : <TimerChrome hidden={running} exit="up" style={[styles.empty, layout.landscape && base.landscapeLeft, grouped && base.grouped]}>
            <IconGrid size={34} color={t.accent} />
            <Text style={{ color: t.text, fontSize: 22, fontWeight: "700", marginTop: 10 }}>Choose your cases</Text>
            <Muted style={{ marginTop: 6, textAlign: "center" }}>Open Cases and select the algorithms to practise.</Muted>
          </TimerChrome>}
          <PracticeReadout landscape={layout.landscape}>
          <TimerSlot running={running} style={base.timerSlot}><TimerSurface timer={timer} disabled={!current || saving} fontSize={timerSize} short={layout.short} /></TimerSlot>
          <TimerChrome hidden={running} exit="down" style={[base.stats, (layout.landscape || layout.short || grouped) && { flex: 0 }, { gap: layout.phone ? 14 : 40 }]}>
            <Kpi center label="Solves" value={String(solves.length)} valueSize={layout.phone ? 18 : 22} />
            <Kpi center label="Best" value={fmtTime(best(times))} valueSize={layout.phone ? 18 : 22} />
            <Kpi center label="Mean" value={fmtTime(mean(times))} valueSize={layout.phone ? 18 : 22} />
          </TimerChrome>
          </PracticeReadout>
        </View>
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
  const byCase = useMemo(() => { const m = new Map<string, SolveDto[]>(); for (const s of solves) if (s.case_id) m.set(s.case_id, [...(m.get(s.case_id) ?? []), s]); return m; }, [solves]);
  const ordered = [...selectedCases].sort((a, b) => (byCase.get(b.id)?.length ?? 0) - (byCase.get(a.id)?.length ?? 0));
  const allTimes = solves.map(s => effective(s.time_ms, s.penalty));
  return <View style={base.panel}>
    <View style={base.panelHeader}>
      <Muted size={13} style={{ flexShrink: 1 }}>{solves.length} solve{solves.length === 1 ? "" : "s"}{solves.length > 0 && ` · best ${fmtTime(best(allTimes))} · mean ${fmtTime(mean(allTimes))}`}</Muted>
      <MiniBtn icon={<IconUndo size={13} color={t.readableMuted} />} label="Undo" onPress={onUndo} disabled={!solves.length} />
    </View>
    <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 4, paddingRight: 4, paddingBottom: navSpace }}>
      {ordered.map(c => {
        const list = byCase.get(c.id) ?? [];
        const times = list.map(s => effective(s.time_ms, s.penalty));
        const b = best(times);
        return <View key={c.id} style={styles.sessionCase}>
          <View style={styles.sessionCube}><CaseDiagram c={c} size={40} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.sessionTitle}><Text style={{ color: t.text, fontSize: 14, fontWeight: "700" }}>{shortId(c)}</Text><Text style={[mono(t, 12), { color: t.readableMuted }]}>{list.length ? `${list.length} · best ${fmtTime(b)} · mean ${fmtTime(mean(times))}` : "no time yet"}</Text></View>
            {list.length > 0 && <View style={styles.sessionTimes}>
              {[...list].reverse().map(s => { const time = effective(s.time_ms, s.penalty); const isBest = time !== null && time === b; return <SolveRow key={s.id} solveId={s.id} style={styles.sessionTime}><Text style={[mono(t, 14, isBest ? "600" : "500"), { color: s.penalty === "dnf" ? t.danger : isBest ? t.accent : t.text2 }]}>{fmtSolve(s.time_ms, s.penalty)}</Text></SolveRow>; })}
            </View>}
          </View>
        </View>;
      })}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  trainingCase: { width: "100%", flex: 1, justifyContent: "flex-end", alignItems: "center" },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: 10 },
  caseHeading: { alignItems: "center", gap: 2, flexShrink: 1 },
  caseNav: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  caseTitle: { fontWeight: "700", textDecorationLine: "underline" },
  setup: { alignItems: "center", gap: 10, marginTop: 12, width: "100%" },
  cubeShadow: { shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 8 } },
  solution: { width: "100%", maxWidth: 600, marginTop: 12, paddingTop: 12, borderTopWidth: 1, alignItems: "center" },
  reveal: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, marginTop: 4, paddingHorizontal: 14, borderRadius: 10 },
  empty: { alignItems: "center", paddingVertical: 20, paddingHorizontal: 12, flex: 1, justifyContent: "flex-end" },
  sessionCase: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 10, paddingHorizontal: 2 },
  sessionCube: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  sessionTitle: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 8, rowGap: 4 },
  sessionTimes: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4, marginTop: 4 },
  sessionTime: { paddingHorizontal: 4, paddingVertical: 2, borderRadius: 6 },
});
