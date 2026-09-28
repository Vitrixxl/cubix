import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { averageOf, best, fmtSolve, fmtTime } from "../../../src/client/lib/format";
import { recordMessage, solveRecords } from "../../../src/client/lib/personalBest";
import { practiceSummary } from "../../../src/client/lib/practiceSummary";
import { CROSS_PLUS_ONE_MOVES, slotWithWhiteDown, withWhiteDown } from "../../../src/shared/crossPlusOne";
import { contextKey, type PracticeContext } from "../../../src/shared/puzzles";
import type { SolveDto } from "../../../src/shared/types";
import { api, localChanged } from "../api";
import { crossContextAtom, crossMovesAtom, crossScrambleAtom, cubeSwitchLockedAtom, deletedSolveIdAtom, statsVersionAtom, updatedSolveAtom } from "../state";
import { useTheme } from "../theme";
import { useLayout } from "../hooks/useLayout";
import { useTimer } from "../hooks/useTimer";
import { usePreservedList } from "../hooks/usePreservedList";
import { ensureLaunchSession, launchSessionId } from "../lib/launchSession";
import { generatePracticeScramble } from "../lib/practiceScramble";
import { crossSolutions, type CrossSolution } from "../scrambler";
import { IconComment, IconEye, IconShuffle, IconTimer, IconTrophy, IconUndo } from "./icons";
import { PuzzlePicker } from "./PuzzlePicker";
import { Sheet } from "./Sheet";
import { LastSolveActions, SolveActionButtons, SolveInfoButton, SolveRow } from "./SolveMenus";
import { TimerSurface } from "./TimerSurface";
import { CubePreview, Moves, PracticeFrame, PromptBlock, TimesColumn, Toast, useBackTo, useTimerFont } from "./TrainingLayout";
import { Btn, Empty, Mark, PageHead, Segmented, SkeletonLine, mono, type MetricItem } from "./ui";

/** Generation shorter than this stays invisible: the previous scramble simply becomes the next one. */
const SLOW_GENERATION_MS = 120;

/** Session figures of the timer (web `metrics()`): best in green, worst in red, running averages in the accent. */
function timerMetrics(solves: SolveDto[]): MetricItem[] {
  const summary = practiceSummary(solves), times = summary.times;
  const bestOf = (size: number) => best(times.slice(size - 1).map((_, i) => averageOf(times.slice(i, i + size))));
  const worst = !times.length ? null : times.includes(null) ? "DNF" : fmtTime(Math.max(...(times as number[])));
  return [
    { label: "Best", value: fmtTime(summary.best), tone: "good" },
    { label: "Worst", value: worst ?? fmtTime(null), tone: "bad" },
    { label: "Mean", value: fmtTime(summary.mean) },
    { label: "Ao5", value: fmtTime(summary.ao5), tone: "accent" },
    { label: "Best Ao5", value: fmtTime(bestOf(5)), tone: "good" },
    { label: "Ao12", value: fmtTime(summary.ao12), tone: "accent" },
    { label: "Best Ao12", value: fmtTime(bestOf(12)), tone: "good" },
    { label: "Solves", value: String(summary.count) },
  ];
}

/**
 * First-block training on the 3×3 (web `crossTraining`): timer solves on scrambles whose white cross and one
 * back pair take exactly 3, 4 or 5 moves, recorded as timer solves of the `cross1-N` scramble type.
 */
export function CrossPractice({ onBack }: { onBack: () => void }) {
  const context = useAtomValue(crossContextAtom);
  const [showTimes, setShowTimes] = useState(false);
  // Each number of moves is its own context: its scramble, its session and its times.
  return <CrossSession key={contextKey(context)} context={context} onBack={onBack} showTimes={showTimes} setShowTimes={setShowTimes} />;
}

function CrossSession({ context, onBack, showTimes, setShowTimes }: { context: PracticeContext; onBack: () => void; showTimes: boolean; setShowTimes: (value: boolean) => void }) {
  const t = useTheme();
  const layout = useLayout();
  const [moves, setMoves] = useAtom(crossMovesAtom);
  const scramble = useAtomValue(crossScrambleAtom);
  const storeScramble = useSetAtom(crossScrambleAtom);
  const lockCube = useSetAtom(cubeSwitchLockedAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const [generating, setGenerating] = useState(false);
  const [slow, setSlow] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const request = useRef(0);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [solves, setSolves] = useState<SolveDto[]>([]);
  const [lastSolveId, setLastSolveId] = useState<number | null>(null);
  const [record, setRecord] = useState({ at: 0, message: "" });
  const [revealed, setRevealed] = useState(false);
  const [solutions, setSolutions] = useState<{ scramble: string; list: CrossSolution[] | null } | null>(null);
  const [solutionError, setSolutionError] = useState("");
  const [replay, setReplay] = useState(0);
  const deletedSolveId = useAtomValue(deletedSolveIdAtom);
  useEffect(() => { if (deletedSolveId !== null) setSolves(list => list.filter(solve => solve.id !== deletedSolveId)); }, [deletedSolveId]);
  const updatedSolve = useAtomValue(updatedSolveAtom);
  useEffect(() => { if (updatedSolve) setSolves(list => list.map(solve => solve.id === updatedSolve.id ? updatedSolve : solve)); }, [updatedSolve]);
  const timesAlways = !layout.phone && layout.width >= 1000;

  const generateNext = useCallback(async () => {
    const id = ++request.current;
    setGenerating(true); setGenerationError(""); setRevealed(false);
    clearTimeout(slowTimer.current);
    slowTimer.current = setTimeout(() => { if (request.current === id) setSlow(true); }, SLOW_GENERATION_MS);
    try {
      const next = await generatePracticeScramble(context);
      if (request.current === id) storeScramble({ context, scramble: next });
    } catch (error) {
      if (request.current === id) setGenerationError((error as Error).message);
    } finally {
      if (request.current === id) { clearTimeout(slowTimer.current); setGenerating(false); setSlow(false); }
    }
  }, [context, storeScramble]);
  useEffect(() => {
    let active = true;
    // Only this launch's session is listed (see lib/launchSession); every solve still counts in the profile.
    const refresh = () => {
      const session = launchSessionId("playground", context);
      if (session === null) { setSolves([]); return; }
      void api.solves("playground", 1000, context.puzzle, context).then(list => { if (active) setSolves(list.filter(s => s.session_id === session).reverse()); });
    };
    refresh();
    const unsubscribe = localChanged.on(refresh);
    if (!scramble) void generateNext();
    return () => { active = false; request.current++; clearTimeout(slowTimer.current); unsubscribe(); };
  }, []);

  // The optimal solutions are searched in the scrambler page once revealed, then kept for this scramble.
  useEffect(() => {
    if (!revealed || !scramble || solutions?.scramble === scramble) return;
    let active = true;
    setSolutions({ scramble, list: null }); setSolutionError("");
    crossSolutions(scramble).then(list => { if (active) setSolutions({ scramble, list }); })
      .catch(error => { if (active) { setSolutions(null); setSolutionError((error as Error).message); } });
    return () => { active = false; };
  }, [revealed, scramble]);

  const onStop = useCallback(async (ms: number) => {
    setSaving(true);
    try {
      const sessionId = await ensureLaunchSession("playground", context);
      const solve = await api.addSolve({ sessionId, caseId: null, timeMs: ms, scramble, ...context });
      setSolves(s => [...s.filter(item => item.id !== solve.id), solve]);
      setLastSolveId(solve.id);
      bumpStats(v => v + 1);
      // Records span every launch, unlike the listed session.
      const message = recordMessage(solveRecords((await api.solves("playground", Infinity, context.puzzle, context)).reverse(), solve.id));
      if (message) setRecord({ at: Date.now(), message });
      void generateNext();
    } finally { setSaving(false); }
  }, [scramble, context, generateNext]);
  const timer = useTimer({ onStop, canStart: !saving && !generating && !!scramble && !generationError });
  const busy = saving || timer.phase === "running" || timer.phase === "holding" || timer.phase === "ready";
  const running = timer.phase === "running";
  useEffect(() => { lockCube(busy || !!timer.saveError); return () => lockCube(false); }, [busy, timer.saveError, lockCube]);
  useBackTo(onBack, !busy);
  const nextScramble = () => { if (!busy && !generating) { timer.reset(); void generateNext(); } };
  const lastSolve = lastSolveId === null ? null : solves.find(solve => solve.id === lastSolveId) ?? null;
  const promptFont = layout.phone ? (scramble.length > 90 ? 15 : 19) : scramble.length > 120 ? 20 : 27;
  const previewSize = layout.phone ? (layout.height < 760 ? 0 : 76) : layout.height < 700 ? 92 : layout.width < 1200 ? 112 : 132;
  const timerFont = useTimerFont();
  const locked = busy || !!timer.saveError;
  const solutionFont = Math.max(15, promptFont - 5);
  const shown = revealed && solutions?.scramble === scramble ? solutions.list : undefined;

  const head = <PageHead title="Training" sub={`Cross + 1 · ${moves} moves`} padding={layout.pagePadding} onBack={onBack} right={<PuzzlePicker />}
    controls={<>
      <Segmented options={CROSS_PLUS_ONE_MOVES.map(n => ({ id: String(n), label: `${n} moves` }))} value={String(moves)} disabled={locked} onChange={value => setMoves(Number(value))} />
      {previewSize > 0 && <Btn iconOnly={layout.phone} icon={IconUndo} label={layout.phone ? undefined : "Replay"} disabled={!scramble} onPress={() => setReplay(n => n + 1)} accessibilityLabel="Replay the scramble on the cube" />}
      <Btn iconOnly={layout.phone} icon={IconShuffle} label={layout.phone ? undefined : "New scramble"} disabled={busy || slow || !!timer.saveError} onPress={nextScramble} accessibilityLabel="New scramble" />
      {!timesAlways && <Btn iconOnly={layout.phone} icon={IconTimer} label={layout.phone ? undefined : "Times"} active={showTimes} disabled={busy} onPress={() => setShowTimes(!showTimes)} accessibilityLabel="Times" />}
    </>} />;

  const prompt = <>
    <PromptBlock label={`Scramble · cross + 1 in ${moves} moves`}>
      {generationError ? <View style={styles.error}><Text style={{ color: t.danger, fontSize: 13 }}>{generationError}</Text><Btn small label="Retry" onPress={() => void generateNext()} /></View>
        : generating && (slow || !scramble) ? <View style={{ gap: promptFont * 0.5, paddingVertical: promptFont * 0.2 }}><SkeletonLine width="94%" height={promptFont * 1.05} /><SkeletonLine width="72%" height={promptFont * 1.05} /></View>
        : <Moves alg={scramble} size={promptFont} />}
    </PromptBlock>
    {revealed && <PromptBlock label="Solution · x2, white on the bottom">
      {shown ? <View style={styles.solutions}>
        {shown.map(v => <View key={v.moves + v.slot} style={styles.solution}>
          <Moves alg={withWhiteDown(v.moves)} size={solutionFont} />
          <Mark textStyle={{ fontSize: 12, lineHeight: 20 }}>{slotWithWhiteDown(v.slot)} pair</Mark>
        </View>)}
        {!shown.length && <Text style={{ color: t.muted, fontSize: 13 }}>No solution within 6 moves.</Text>}
      </View> : solutionError ? <View style={styles.error}><Text style={{ color: t.danger, fontSize: 13 }}>{solutionError}</Text><Btn small label="Retry" onPress={() => { setRevealed(false); setTimeout(() => setRevealed(true)); }} /></View>
        : <View accessibilityLabel="Searching the solutions" style={{ paddingVertical: solutionFont * 0.1 }}><SkeletonLine width={solutionFont * 9} height={solutionFont * 1.4} /></View>}
    </PromptBlock>}
    <View style={styles.actions}>
      <Btn icon={IconEye} label={revealed ? "Hide solution" : "Show solution"} disabled={busy || !scramble || generating} onPress={() => setRevealed(v => !v)} />
    </View>
  </>;

  const times = <CrossTimes solves={solves} context={context} />;
  return <>
    <PracticeFrame head={head} prompt={prompt} timer={timer} disabled={!!timer.saveError}
      visual={previewSize > 0 && scramble && !(generating && slow) ? <CubePreview alg={scramble} size={previewSize} view="iso" replay={replay} /> : previewSize > 0 ? <View style={{ width: previewSize, height: previewSize }} /> : null}
      notice={<Toast at={record.at} hidden={running} icon={<IconTrophy size={14} color={t.good} />} message={record.message} />}
      readout={<TimerSurface timer={timer} fontSize={timerFont} short={layout.short} actions={lastSolve && !saving ? <LastSolveActions solve={lastSolve} compact={layout.short} /> : null} />}
      metrics={timerMetrics(solves)} columns={4} dense
      side={!layout.phone && (timesAlways || showTimes) ? <TimesColumn title="Times" count={solves.length} onClose={timesAlways ? undefined : () => setShowTimes(false)}>{times}</TimesColumn> : null} />
    {layout.phone && <Sheet open={showTimes} onClose={() => setShowTimes(false)} title="Times" sub={String(solves.length)} tall flush>{times}</Sheet>}
  </>;
}

/** The times of this session, newest first: number, time, then its actions (`.times` rows). */
function CrossTimes({ solves, context }: { solves: SolveDto[]; context: PracticeContext }) {
  const t = useTheme();
  const scroll = usePreservedList<SolveDto>(`cross-times:${contextKey(context)}`);
  return <FlatList {...scroll} data={[...solves].reverse()} keyExtractor={solve => String(solve.id)} initialNumToRender={16} maxToRenderPerBatch={12} windowSize={5}
    style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}
    ListEmptyComponent={<Empty>No times yet.</Empty>}
    renderItem={({ item: s, index: i }) => <SolveRow solve={s} style={[styles.timeRow, { borderColor: t.line }]}>
      <Text style={[mono(t, 12), { width: 28, color: t.muted }]}>{solves.length - i}</Text>
      <Text style={[mono(t, 15, "500"), { minWidth: 64 }, s.penalty === "dnf" && { color: t.danger }]}>{fmtSolve(s.time_ms, s.penalty)}</Text>
      {s.comment ? <IconComment size={12} color={t.muted} /> : null}
      <View style={styles.timeActions}>
        <SolveActionButtons solve={s} />
        <SolveInfoButton solve={s} />
      </View>
    </SolveRow>} />;
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  error: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  solutions: { gap: 2 },
  solution: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 14, borderBottomWidth: 1 },
  timeActions: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto" },
});
