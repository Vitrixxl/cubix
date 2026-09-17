import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { averageOf, best, effective, fmtSolve, fmtTime, mean } from "../../../src/client/lib/format";
import { contextKey, puzzleInfo, scrambleLabel, SOLVE_MODES, type PracticeContext, type ScrambleType, type SolveMode } from "../../../src/shared/puzzles";
import type { Penalty, SolveDto } from "../../../src/shared/types";
import { api, localChanged } from "../api";
import { cubeSwitchLockedAtom, deletedSolveIdAtom, playgroundScrambleAtom, practiceContextAtom, scrambleTypeAtom, solveModeAtom } from "../state";
import { useTheme } from "../theme";
import { useTimer } from "../hooks/useTimer";
import { useLayout } from "../hooks/useLayout";
import { usePreservedList } from "../hooks/usePreservedList";
import { ensureLaunchSession, launchSessionId } from "../lib/launchSession";
import { generatePracticeScramble } from "../lib/practiceScramble";
import { AlgText } from "../components/AlgText";
import { IconShuffle, IconTimer } from "../components/icons";
import { PanelButton, PracticePanel, ToolbarAction } from "../components/PracticePanel";
import { PracticeContent, PracticeReadout, TimerChrome, TimerSlot, TouchArea } from "../components/Practice";
import { Select } from "../components/Select";
import { SolveActionButtons, SolveInfoButton, SolveRow } from "../components/SolveMenus";
import { StopSurface, TimerSurface } from "../components/TimerSurface";
import { Bone } from "../components/Bone";
import { Caption, Empty, Kpi, MiniBtn, Muted, mono } from "../components/ui";

/** Generation shorter than this stays invisible: the previous scramble simply becomes the next one. */
const SLOW_GENERATION_MS = 120;

export function PlaygroundPage() {
  const context = useAtomValue(practiceContextAtom);
  const [showTimes, setShowTimes] = useState(false);
  // A new puzzle, mode or scramble type starts a fresh attempt and session.
  return <PlaygroundSession key={contextKey(context)} context={context} showTimes={showTimes} setShowTimes={setShowTimes} />;
}

function PlaygroundSession({ context, showTimes, setShowTimes }: { context: PracticeContext; showTimes: boolean; setShowTimes: (value: boolean) => void }) {
  const t = useTheme();
  const layout = useLayout();
  const info = puzzleInfo(context.puzzle);
  const setSolveMode = useSetAtom(solveModeAtom);
  const setScrambleType = useSetAtom(scrambleTypeAtom);
  const [generating, setGenerating] = useState(false);
  // Only a generation that takes a while (cubing.js in the native engine) shows its skeleton; instant
  // ones would otherwise flash an empty frame between the previous scramble and the next.
  const [slow, setSlow] = useState(false);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [generationError, setGenerationError] = useState("");
  const request = useRef(0);
  const lockCube = useSetAtom(cubeSwitchLockedAtom);
  const [saving, setSaving] = useState(false);
  const [actionHeight, setActionHeight] = useState(40);
  const [scramble, setScramble] = useAtom(playgroundScrambleAtom);
  const [solves, setSolves] = useState<SolveDto[]>([]);
  const deletedSolveId = useAtomValue(deletedSolveIdAtom);
  useEffect(() => { if (deletedSolveId !== null) setSolves(list => list.filter(solve => solve.id !== deletedSolveId)); }, [deletedSolveId]);
  const wide = layout.wide;

  const generateNext = useCallback(async () => {
    const id = ++request.current;
    setGenerating(true); setGenerationError("");
    clearTimeout(slowTimer.current);
    slowTimer.current = setTimeout(() => { if (request.current === id) setSlow(true); }, SLOW_GENERATION_MS);
    try {
      const next = await generatePracticeScramble(context);
      if (request.current === id) setScramble(next);
    } catch (error) {
      if (request.current === id) setGenerationError((error as Error).message);
    } finally {
      if (request.current === id) { clearTimeout(slowTimer.current); setGenerating(false); setSlow(false); }
    }
  }, [context, setScramble]);
  useEffect(() => () => clearTimeout(slowTimer.current), []);
  useEffect(() => {
    let active = true;
    // Only this launch's session is listed (see lib/launchSession); every solve still syncs to the profile.
    const refresh = () => {
      const session = launchSessionId("playground", context);
      if (session === null) { setSolves([]); return; }
      void api.solves("playground", 1000, context.puzzle, context).then(list => { if (active) setSolves(list.filter(s => s.session_id === session).reverse()); });
    };
    refresh();
    const unsubscribe = localChanged.on(refresh);
    if (!scramble) void generateNext();
    return () => { active = false; request.current++; unsubscribe(); };
  }, []);

  const ensureSession = () => ensureLaunchSession("playground", context);
  const onStop = useCallback(async (ms: number) => {
    setSaving(true);
    try {
      const sessionId = await ensureSession();
      const solve = await api.addSolve({ sessionId, caseId: null, timeMs: ms, scramble, ...context });
      setSolves(s => [...s.filter(item => item.id !== solve.id), solve]);
      void generateNext();
    } finally { setSaving(false); }
  }, [scramble, context, generateNext]);
  const timer = useTimer({ onStop, canStart: !saving && !generating && !!scramble && !generationError });

  const penalty = async (s: SolveDto, p: Penalty) => {
    const next = s.penalty === p ? "none" : p;
    const updated = await api.setPenalty(s.id, next);
    setSolves(list => list.map(x => (x.id === s.id ? updated : x)));
  };
  const times = solves.map(s => effective(s.time_ms, s.penalty));
  const busy = saving || timer.phase === "running" || timer.phase === "holding" || timer.phase === "ready";
  const running = timer.phase === "running";
  useEffect(() => { lockCube(busy || !!timer.saveError); return () => lockCube(false); }, [busy, timer.saveError, lockCube]);
  const nextScramble = () => { if (!busy && !generating) void generateNext(); };
  const scroll = usePreservedList<SolveDto>(`playground-times:${contextKey(context)}`);
  const bigCube = !info.cubeSize || info.cubeSize > 3;
  const scrambleSize = layout.phone ? (bigCube ? 16 : 21) : layout.short ? 19 : Math.max(22, Math.min(30, layout.width * 0.022));
  // Phones centre the scramble, timer and stats as one group instead of pinning the timer mid-screen.
  const grouped = layout.phone && !layout.landscape;
  const timerSize = layout.short ? Math.max(48, Math.min(layout.height * 0.09, 72)) : layout.phone ? Math.max(56, Math.min(layout.width * 0.15, 84)) : Math.max(60, Math.min(layout.width * 0.07, 108));

  return <View style={styles.page}>
    <View style={[styles.workspace, wide && styles.workspaceWide]}>
      {wide && <View style={{ flex: 1 }} />}
      <TouchArea timer={timer} enabled={!timer.saveError} style={[styles.center, wide && { flex: 2.6 }]}>
        <TimerChrome hidden={running} style={[styles.toolbar, { paddingHorizontal: layout.pagePadding, paddingTop: layout.phone ? 8 : 12 }]}>
          <View style={[styles.toolbarGroup, { flex: 1, justifyContent: "flex-end" }]}>
            {!wide && !showTimes && <PanelButton title="Times" icon={<IconTimer size={15} color={t.text2} />} disabled={busy} onPress={() => setShowTimes(true)} phone={layout.phone} />}
          </View>
        </TimerChrome>
        <View style={[styles.stack, layout.landscape && styles.stackLandscape, { paddingHorizontal: layout.pagePadding, paddingBottom: layout.short ? layout.navSpace + actionHeight + 32 : 44 }]}>
          <TimerChrome hidden={running} exit="up" style={[styles.scramble, layout.landscape && styles.landscapeLeft, grouped && styles.grouped]}>
            <PracticeContent>
            <Caption style={{ marginBottom: 8, textAlign: "center" }}>{info.label} · {scrambleLabel(context.scrambleType)}</Caption>
            {generating && (slow || !scramble) ? <View style={{ width: "100%", alignItems: "center", paddingHorizontal: layout.phone ? 12 : 0 }}><Bone width="92%" text={scrambleSize} /><Bone width="80%" text={scrambleSize} /></View> : generationError ? <View style={{ alignItems: "center", gap: 4 }}><Text style={{ color: t.danger, fontSize: 13, textAlign: "center" }}>{generationError}</Text><MiniBtn label="Retry" onPress={() => void generateNext()} /></View>
              : <AlgText alg={scramble} size={scrambleSize} lineHeight={scrambleSize * (layout.phone ? 1.55 : 1.6)} wordSpacing={1} style={{ textAlign: "center", paddingHorizontal: layout.phone ? 12 : 0 }} />}
            </PracticeContent>
          </TimerChrome>
          <PracticeReadout landscape={layout.landscape}>
          <TimerSlot running={running} style={styles.timerSlot}><TimerSurface timer={timer} fontSize={timerSize} short={layout.short} /></TimerSlot>
          <TimerChrome hidden={running} exit="down" style={[styles.stats, (layout.landscape || grouped) && { flex: 0 }, { gap: layout.phone ? 14 : Math.max(16, Math.min(layout.width * 0.035, 40)) }]}>
            <Kpi center label="Solves" value={String(solves.length)} valueSize={layout.phone ? 18 : 22} />
            <Kpi center label="Best" value={fmtTime(best(times))} valueSize={layout.phone ? 18 : 22} />
            <Kpi center label="Mean" value={fmtTime(mean(times))} valueSize={layout.phone ? 18 : 22} />
            <Kpi center label="Ao5" value={fmtTime(times.length >= 5 ? averageOf(times.slice(-5)) : null)} valueSize={layout.phone ? 18 : 22} />
            <Kpi center label="Ao12" value={fmtTime(times.length >= 12 ? averageOf(times.slice(-12)) : null)} valueSize={layout.phone ? 18 : 22} />
          </TimerChrome>
          </PracticeReadout>
        </View>
        <TimerChrome hidden={running} exit="down" style={[styles.bottomActions, { bottom: layout.navSpace + 20, paddingHorizontal: layout.pagePadding }]}>
          <View onLayout={event => setActionHeight(event.nativeEvent.layout.height)} style={styles.bottomActionRow}>
            <Select value={context.scrambleType} disabled={busy || !!timer.saveError} flat="toolbar" accessibilityLabel="Scramble type" options={info.scrambles.map(type => ({ value: type, label: scrambleLabel(type) }))} onChange={value => setScrambleType(value as ScrambleType)} />
            <Select value={context.solveMode} disabled={busy || !!timer.saveError} flat="toolbar" accessibilityLabel="Solve mode" options={SOLVE_MODES.map(mode => ({ value: mode.id, label: mode.label }))} onChange={value => setSolveMode(value as SolveMode)} />
            <ToolbarAction icon={<IconShuffle size={15} color={t.text2} />} label="New scramble" disabled={busy || slow || !!timer.saveError} onPress={nextScramble} phone={layout.phone} />
          </View>
        </TimerChrome>
      </TouchArea>
      <PracticePanel open={showTimes} wide={wide} side="right" title="Times" icon={<IconTimer size={15} color={t.text2} />} disabled={busy} onOpen={() => setShowTimes(true)} onClose={() => setShowTimes(false)}>
        <View style={styles.panel}>
          <View style={styles.panelHeader}><Muted size={13}>{solves.length} solve{solves.length === 1 ? "" : "s"}</Muted></View>
          <FlatList {...scroll} data={[...solves].reverse()} keyExtractor={solve => String(solve.id)} initialNumToRender={16} maxToRenderPerBatch={12} windowSize={5} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 4, paddingRight: 4, paddingBottom: layout.navSpace }}
            ListEmptyComponent={<Empty>No times yet.</Empty>}
            renderItem={({ item: s, index: i }) => <SolveRow key={s.id} solveId={s.id} style={styles.solveRow}>
              <Text style={[mono(t, 12), { width: 26, color: t.muted }]}>{solves.length - i}</Text>
              <Text style={[mono(t, 16, "600"), { minWidth: 64 }, s.penalty === "dnf" && { color: t.danger }]}>{fmtSolve(s.time_ms, s.penalty)}</Text>
              <View style={styles.actions}>
                <SolveInfoButton solve={s} />
                <MiniBtn label="+2" on={s.penalty === "+2"} onPress={() => void penalty(s, "+2")} />
                <MiniBtn label="DNF" on={s.penalty === "dnf"} onPress={() => void penalty(s, "dnf")} />
                <SolveActionButtons solveId={s.id} />
              </View>
            </SolveRow>}
          />
        </View>
      </PracticePanel>
    </View>
    <StopSurface timer={timer} />
  </View>;
}

export const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0 },
  workspace: { flex: 1, minHeight: 0 },
  workspaceWide: { flexDirection: "row", gap: 24, paddingHorizontal: 24, paddingVertical: 12 },
  center: { flex: 1, minWidth: 0, minHeight: 0 },
  toolbar: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 2, flexDirection: "row", alignItems: "flex-start", gap: 8, minHeight: 34 },
  toolbarGroup: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  bottomActions: { position: "absolute", left: 0, right: 0, zIndex: 2 },
  bottomActionRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 6 },
  stack: { flex: 1, alignItems: "center", justifyContent: "center", width: "100%", maxWidth: 720, alignSelf: "center", paddingVertical: 44 },
  stackLandscape: { flexDirection: "row", maxWidth: 850, paddingTop: 44, paddingBottom: 72, columnGap: 20 },
  scramble: { width: "100%", maxWidth: 680, flex: 1, justifyContent: "flex-end", alignItems: "center" },
  /** Phone portrait: the block takes its content height and only shrinks when the screen is too small. */
  grouped: { flex: 0, flexShrink: 1, minHeight: 0 },
  timerSlot: { width: "100%", alignItems: "center" },
  stats: { flexDirection: "row", justifyContent: "center", width: "100%", maxWidth: 560, flex: 1, alignItems: "flex-start" },
  landscapeLeft: { width: "48%", flex: undefined, height: "100%", justifyContent: "center" },
  panel: { flex: 1, gap: 10, minHeight: 0 },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 30 },
  solveRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10 },
  actions: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto" },
});
