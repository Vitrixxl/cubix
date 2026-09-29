import { practiceSummary, trainingSessionRows } from "../../../src/client/lib/practiceSummary";
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { effective, fmtSolve, fmtTime } from "../../../src/client/lib/format";
import { learningGoalMet, pendingCases } from "../../../src/client/lib/learningGoal";
import { EMPTY_TRAINING_HISTORY, trainingHistoryReducer } from "../../../src/client/lib/trainingHistory";
import { isReviewMode, learningModeForPuzzle, learningTrackOf, type LearningMode } from "../../../src/client/lib/dailyLearning";
import { combineAuf, compensateAuf, randomAuf } from "../../../src/shared/cube";
import { viewForStage } from "../../../src/shared/cubeDiagram";
import { puzzleInfo, type PracticeContext } from "../../../src/shared/puzzles";
import type { CaseDto, SolveDto } from "../../../src/shared/types";
import { api } from "../api";
import { casesAtom, learnedCaseIdsAtom, learningGoalAtom, puzzleAtom, randomAufAtom, replaceRouteAtom, routeAtom, selectedCaseIdsAtom, solveModeAtom, statsVersionAtom, trainingKindAtom, trainingSetupModeAtom, trainingStepAtom, userAtom } from "../state";
import { useTheme } from "../theme";
import { useTimer } from "../hooks/useTimer";
import { useLayout } from "../hooks/useLayout";
import { usePreservedScroll } from "../hooks/usePreservedScroll";
import { useDailyLearning } from "../hooks/useDailyLearning";
import { executableAlg, maskForStage, shortId } from "../lib/caseState";
import { ensureLaunchSession } from "../lib/launchSession";
import { CaseDiagram } from "../components/CaseDiagram";
import { CrossPractice } from "../components/CrossPractice";
import { IconBack, IconCheck, IconComment, IconEye, IconGrid, IconNext, IconShuffle, IconTimer, IconUndo } from "../components/icons";
import { LearningGroups } from "../components/LearningGroups";
import { PuzzlePicker } from "../components/PuzzlePicker";
import { Sheet } from "../components/Sheet";
import { LastSolveActions, SolveRow } from "../components/SolveMenus";
import { TimerSurface } from "../components/TimerSurface";
import { CubePreview, Moves, PracticeFrame, PromptBlock, TimesColumn, Toast, framePreviewSize, useBackTo, usePracticeLock, useSessionSolves, useTimerFont } from "../components/Practice";
import { plural, TrainingSetup, type DailyLearning } from "../components/TrainingSetup";
import { Btn, H1, Muted, PageHead, mono, CellGroup } from "../components/ui";

export function TrainingPage() {
  const user = useAtomValue(userAtom);
  // Learning plans belong to an account: another one starts from its own.
  return <TrainingRoot key={user?.id ?? "guest"} />;
}

/** Setup first, then the practice it started: cases of the catalogue or cross + 1 scrambles (web `trainingStep`). */
function TrainingRoot() {
  const daily = useDailyLearning();
  const puzzle = useAtomValue(puzzleAtom);
  const solveMode = useAtomValue(solveModeAtom);
  const [step, setStep] = useAtom(trainingStepAtom);
  const [kind, setKind] = useAtom(trainingKindAtom);
  const setSetupMode = useSetAtom(trainingSetupModeAtom);
  const route = useAtomValue(routeAtom);
  const replaceRoute = useSetAtom(replaceRouteAtom);
  // Training a group or a case from the catalogue skips the setup screen.
  const autostart = route.page === "training" && !!route.autostart;
  useEffect(() => {
    if (!autostart) return;
    setKind("cases"); daily.setMode("practice"); setStep("practice");
    replaceRoute({ page: "training" });
  }, [autostart]);
  const start = useCallback((mode: string) => {
    if (mode === "cross1") { if (puzzle !== "333") return; setKind("cross1"); }
    else {
      setKind("cases");
      if (learningModeForPuzzle(mode, puzzle) === mode) daily.setMode(mode as LearningMode);
    }
    setStep("practice");
  }, [puzzle, daily.setMode]);
  const toSetup = useCallback(() => { setSetupMode(""); setStep("setup"); }, []);
  if (step === "setup" && !autostart) return <TrainingSetup daily={daily} onStart={start} />;
  if (kind === "cross1" && puzzle === "333" && !autostart) return <CrossPractice key={solveMode} onBack={toSetup} />;
  return <TrainingSession key={`${puzzle}:${solveMode}`} daily={daily} onBack={toSetup} />;
}

/** Case practice: the chosen cases one after the other, their setup, solution and session times. */
function TrainingSession({ daily, onBack }: { daily: DailyLearning; onBack: () => void }) {
  const t = useTheme();
  const layout = useLayout();
  const puzzle = useAtomValue(puzzleAtom);
  const cube = puzzleInfo(puzzle).cubeSize;
  const supportsAuf = !!cube;
  const solveMode = useAtomValue(solveModeAtom);
  const cases = useAtomValue(casesAtom);
  const [freeSelected, setSelected] = useAtom(selectedCaseIdsAtom);
  const [showGroups, setShowGroups] = useState(false);
  const learning = daily.mode !== "practice";
  const reviewing = isReviewMode(daily.mode);
  const track = learningTrackOf(daily.mode);
  const selected = useMemo(() => reviewing ? daily.reviewIds : learning ? daily.assignment ? [daily.assignment.caseId] : [] : freeSelected, [reviewing, daily.reviewIds, learning, daily.assignment?.caseId, freeSelected]);
  const [learnedIds, toggleLearned] = useAtom(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [useAuf, setUseAuf] = useAtom(randomAufAtom);
  const setRoute = useSetAtom(routeAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const byId = useMemo(() => new Map(cases.map(c => [c.id, c])), [cases]);
  const selectedCases = useMemo(() => selected.map(id => byId.get(id)).filter((c): c is CaseDto => !!c), [selected, byId]);
  const [caseHistory, navigateCase] = useReducer(trainingHistoryReducer, EMPTY_TRAINING_HISTORY);
  const entry = caseHistory.entries[caseHistory.index] ?? null;
  const current = entry && selected.includes(entry.c.id) ? entry : null;
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [replay, setReplay] = useState(0);
  // The time just recorded keeps its buttons under the timer until the next attempt or its deletion.
  const [lastSolveId, setLastSolveId] = useState<number | null>(null);
  // Wide windows keep the session in view; narrower ones open it on demand.
  const timesAlways = !layout.phone && layout.width >= 1360;
  const [showTimes, setShowTimes] = useState(false);
  // The session belongs to this launch; the panel only lists its solves (see lib/launchSession).
  const context: PracticeContext = { puzzle, solveMode, scrambleType: "case" };
  const [solves, setSolves] = useSessionSolves("training", context);

  const pick = useCallback((pool: CaseDto[]) => {
    navigateCase({ type: "next", pool, sample: Math.random(), auf: useAuf && supportsAuf ? randomAuf() : "" });
    setRevealed(false);
  }, [useAuf, supportsAuf]);
  useEffect(() => { if (!current || !selected.includes(current.c.id)) pick(selectedCases); }, [selectedCases, pick]);
  // Celebrate once every selected case is learned, whether marked here or from the case details.
  const store = useStore();
  const [celebratedAt, setCelebratedAt] = useState(0);
  useEffect(() => {
    const previous = store.get(learningGoalAtom);
    if (previous?.puzzle === puzzle && learningGoalMet(previous.pending, selected, learned)) setCelebratedAt(Date.now());
    store.set(learningGoalAtom, { puzzle, pending: pendingCases(selected, learned) });
  }, [store, puzzle, selected, learned]);

  const onStop = useCallback(async (ms: number) => {
    if (!current) return;
    setSaving(true);
    try {
      const sessionId = await ensureLaunchSession("training", context, selected);
      const setupText = cube ? combineAuf(current.c.setup, current.auf) : current.c.setup;
      const solve = await api.addSolve({ sessionId, caseId: current.c.id, timeMs: ms, scramble: setupText, puzzle, solveMode, scrambleType: "case" });
      setSolves(s => [...s.filter(item => item.id !== solve.id), solve]);
      setLastSolveId(solve.id);
      bumpStats(v => v + 1);
      pick(selectedCases);
    } finally { setSaving(false); }
  }, [current, selectedCases, pick]);
  const timer = useTimer({ onStop, canStart: !saving && !!current });
  const { busy, running, locked } = usePracticeLock(timer, saving);
  useBackTo(onBack, !busy);

  const remove = async (id: number) => { await api.deleteSolve(id); setSolves(s => s.filter(x => x.id !== id)); bumpStats(v => v + 1); };
  const undoLast = () => { const last = solves.at(-1); if (last) void remove(last.id); };
  const lastSolve = lastSolveId === null ? null : solves.find(solve => solve.id === lastSolveId) ?? null;
  const primary = current?.c.algorithms[0];
  const shownSetup = current ? (cube ? combineAuf(current.c.setup, current.auf) : current.c.setup) : "";
  const shownAlgorithm = primary && current ? (cube ? compensateAuf(executableAlg(primary), current.auf) : executableAlg(primary)) : "";
  const previousCase = () => {
    const previous = caseHistory.entries[caseHistory.index - 1];
    if (busy || learning || !previous) return;
    setSelected(ids => ids.includes(previous.c.id) ? ids : [...ids, previous.c.id]);
    navigateCase({ type: "previous" }); setRevealed(false); timer.reset();
  };
  const nextCase = () => { if (!busy) { pick(selectedCases); timer.reset(); } };
  const setMode = (mode: LearningMode) => { if (!busy && !timer.saveError) { daily.setMode(mode); timer.reset(); } };
  const summary = practiceSummary(solves);
  const currentLearned = !!current && learned.has(current.c.id);
  const view = current ? viewForStage(current.c.stage) : "top";
  const hasCube = !!cube && !!current && !current.c.diagram;
  const compact = layout.width <= 900 || layout.height <= 700;
  const promptFont = layout.phone ? (shownSetup.length > 90 ? 15 : 19) : shownSetup.length > 220 ? 16 : shownSetup.length > 120 ? (compact ? 17 : 20) : compact ? 22 : 27;
  const previewSize = framePreviewSize(layout);
  const timerFont = useTimerFont();

  const head = <PageHead title="Training" padding={layout.pagePadding} onBack={onBack}
    sub={track ? `Learn ${track}` : reviewing ? "Review learned" : `Free practice · ${plural(selected.length, "case")}`}
    right={<PuzzlePicker />}
    controls={<>
      {learning && !reviewing && <Btn icon={IconGrid} label="Groups" disabled={locked} onPress={() => setShowGroups(true)} />}
      {track && <Btn label={layout.phone ? "Review" : "Train learned"} active={reviewing} disabled={locked || !reviewing && !daily.trackLearned} onPress={() => setMode(reviewing ? track : `review:${track}`)} accessibilityLabel={`Train every learned ${track} case`} />}
      {reviewing && <Btn icon={IconNext} label="Next" disabled={busy} onPress={nextCase} />}
      {supportsAuf && <Btn iconOnly={layout.phone} icon={IconShuffle} label={layout.phone ? undefined : "Random AUF"} active={useAuf} disabled={busy} onPress={() => setUseAuf(v => !v)} accessibilityLabel="Random AUF" />}
      {hasCube && view === "iso" && previewSize > 0 && <Btn iconOnly={layout.phone} icon={IconUndo} label={layout.phone ? undefined : "Replay"} onPress={() => setReplay(n => n + 1)} accessibilityLabel="Replay the setup on the cube" />}
      {!timesAlways && <Btn iconOnly={layout.phone} icon={IconTimer} label={layout.phone ? undefined : "Session"} active={showTimes} disabled={busy} onPress={() => setShowTimes(v => !v)} accessibilityLabel="Session" />}
    </>} />;

  const prompt = current ? <>
    <View style={styles.caption}>
      <Pressable disabled={busy} onPress={() => setRoute({ page: "algorithms", caseId: current.c.id })} accessibilityRole="button" accessibilityLabel={`Open ${current.c.name}`}>
        <Text style={[styles.caseTitle, { color: t.text, fontSize: layout.phone ? 19 : 24 }]}>{current.c.name}</Text>
      </Pressable>
      <Text numberOfLines={1} style={[styles.caseKind, { color: t.muted }]}>{learning ? daily.status : current.c.setLabel + (current.c.group && current.c.group !== current.c.setLabel ? " · " + current.c.group : "")}</Text>
      <CellGroup style={[styles.caseNav, layout.phone && { width: "100%" }]}>
        <Btn label={currentLearned ? "Learned" : "Mark learned"} icon={currentLearned ? IconCheck : undefined} tone={currentLearned ? "good" : undefined} disabled={busy} onPress={() => toggleLearned(current.c.id)} accessibilityState={{ selected: currentLearned }} />
        {!learning && <Btn iconOnly icon={IconBack} disabled={busy || caseHistory.index <= 0} onPress={previousCase} accessibilityLabel="Previous case" />}
        {!learning && <Btn iconOnly icon={IconNext} disabled={busy} onPress={nextCase} accessibilityLabel="Next case" />}
      </CellGroup>
    </View>
    <PromptBlock label="Setup"><Moves alg={shownSetup} size={promptFont} /></PromptBlock>
    {revealed && primary && <PromptBlock label="Algorithm"><Moves alg={shownAlgorithm} size={Math.max(15, promptFont - 5)} /></PromptBlock>}
    <View style={styles.actions}>
      {primary && <Btn icon={IconEye} label={revealed ? "Hide solution" : "Show solution"} disabled={busy} onPress={() => setRevealed(v => !v)} />}
      {primary?.youtube && <Btn label="Watch video" onPress={() => void Linking.openURL(primary.youtube!)} />}
    </View>
  </> : <View style={styles.empty}>
    <H1 size={20}>{reviewing ? "No learned cases yet" : learning ? "Track complete" : "Choose your cases"}</H1>
    <Muted>{learning ? daily.status : "Select the cases you want to practise."}</Muted>
    <View style={styles.actions}>
      {!learning && <Btn variant="primary" label="Choose cases" onPress={onBack} />}
      {track && !reviewing && daily.trackLearned > 0 && <Btn variant="primary" label="Train learned" disabled={locked} onPress={() => setMode(`review:${track}`)} />}
    </View>
  </View>;

  const visual = current && previewSize > 0 ? (hasCube
    ? <CubePreview alg={shownSetup} cube={cube!} size={previewSize} mask={maskForStage(current.c.stage)} view={view} replay={replay} />
    : <CaseDiagram c={current.c} size={previewSize} />) : null;

  const times = <TimesPanel selectedCases={selectedCases} solves={solves} />;
  return <>
    <PracticeFrame head={head} prompt={prompt} visual={visual} timer={timer} disabled={!current || saving || !!timer.saveError}
      notice={<Toast at={celebratedAt} hidden={running} icon={<IconCheck size={14} color={t.good} />} message="Well done! Every selected case is learned." />}
      readout={<TimerSurface timer={timer} disabled={!current || saving} fontSize={timerFont} short={layout.short} actions={lastSolve && !saving ? <LastSolveActions solve={lastSolve} /> : null} />}
      metrics={[{ label: "Best", value: fmtTime(summary.best), tone: "good" }, { label: "Mean", value: fmtTime(summary.mean) }, { label: "Solves", value: String(summary.count) }]}
      side={!layout.phone && (timesAlways || showTimes) ? <TimesColumn title="Session" count={solves.length} onClose={timesAlways ? undefined : () => setShowTimes(false)} actions={solves.length ? <Btn small label="Undo" onPress={undoLast} /> : null}>{times}</TimesColumn> : null} />
    {layout.phone && <Sheet open={showTimes} onClose={() => setShowTimes(false)} title="Session" sub={String(solves.length)} tall flush
      actions={solves.length ? <Btn small label="Undo" onPress={undoLast} /> : null}>{times}</Sheet>}
    <Sheet open={showGroups} onClose={() => setShowGroups(false)} title={`Group order · ${daily.mode}`} tall>
      {showGroups && <LearningGroups key={daily.mode} groups={daily.groups} disabled={locked} onReorder={daily.reorderGroups} />}
    </Sheet>
  </>;
}

/** The training session grouped by case (`.session-case`): picture and name, then its times as badges. */
function TimesPanel({ selectedCases, solves }: { selectedCases: CaseDto[]; solves: SolveDto[] }) {
  const t = useTheme();
  const scroll = usePreservedScroll(`training-times:${selectedCases[0]?.puzzle_id ?? selectedCases[0]?.cube_size ?? 3}`);
  const ordered = useMemo(() => trainingSessionRows(selectedCases, solves), [selectedCases, solves]);
  return <ScrollView ref={scroll.ref} onScroll={scroll.onScroll} onContentSizeChange={scroll.onContentSizeChange} scrollEventThrottle={64} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
    {ordered.map(({ c, solves: list, best: b, mean: average, validCount }) => <View key={c.id} style={[styles.sessionCase, { borderColor: t.line }]}>
      <View style={styles.sessionPicture}>
        <CaseDiagram c={c} size={40} />
        <Text numberOfLines={1} style={{ color: t.secondary, fontSize: 11 }}>{shortId(c)}</Text>
      </View>
      {list.length === 0 ? <View style={styles.sessionBody}><View style={[styles.sessionDash, { backgroundColor: t.muted, opacity: 0.6 }]} /></View> : <View style={styles.sessionBody}>
        {validCount > 1 && <Text numberOfLines={1} style={[mono(t, 11), { color: t.muted }]}>mean {fmtTime(average)}</Text>}
        <View style={styles.sessionTimes}>
          {[...list].reverse().map(s => {
            const time = effective(s.time_ms, s.penalty), isBest = time !== null && time === b;
            return <SolveRow key={s.id} solve={s} style={[styles.sessionTime, { backgroundColor: isBest ? t.soft : t.surface2 }]}>
              <Text style={[mono(t, 12, isBest ? "600" : "500"), { color: s.penalty === "dnf" ? t.danger : isBest ? t.accent : t.text }]}>{fmtSolve(s.time_ms, s.penalty)}</Text>
              {s.comment ? <IconComment size={11} color={t.muted} /> : null}
            </SolveRow>;
          })}
        </View>
      </View>}
    </View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  caption: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4, marginBottom: 4 },
  caseTitle: { fontWeight: "600", letterSpacing: -0.4, flexShrink: 0 },
  caseKind: { flex: 1, minWidth: 0, fontSize: 13 },
  caseNav: { flexDirection: "row", gap: 4, flexShrink: 0 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  empty: { gap: 6 },
  sessionCase: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1 },
  sessionPicture: { width: 48, alignItems: "center", gap: 4 },
  sessionBody: { flex: 1, minWidth: 0, minHeight: 40, justifyContent: "center", gap: 6 },
  sessionDash: { width: 14, height: 2, borderRadius: 0 },
  sessionTimes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sessionTime: { flexDirection: "row", alignItems: "center", gap: 4, height: 24, paddingHorizontal: 7, borderRadius: 0 },
});
