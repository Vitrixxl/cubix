import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { fmtSolve, TIME_ENTRIES, type TimeEntry } from "../../../src/client/lib/format";
import { recordMessage, solveRecords } from "../../../src/client/lib/personalBest";
import { applyAlg, parseAlg, solved, type Move } from "../../../src/shared/cube";
import { contextKey, eventLabel, puzzleInfo, scrambleLabel, type PracticeContext, type ScrambleType } from "../../../src/shared/puzzles";
import type { SolveDto } from "../../../src/shared/types";
import { api } from "../api";
import { playgroundScrambleAtom, practiceContextAtom, scrambleTypeAtom, timeEntryAtom } from "../state";
import { useTheme } from "../theme";
import { useTimer } from "../hooks/useTimer";
import { useLayout } from "../hooks/useLayout";
import { usePreservedList } from "../hooks/usePreservedList";
import { ensureLaunchSession } from "../lib/launchSession";
import { AlgText } from "../components/AlgText";
import { IconComment, IconShuffle, IconTimer, IconTrophy, IconUndo } from "../components/icons";
import { Notice, RunningFade, TouchArea, sessionMetrics, usePracticeLock, useScrambleGeneration, useSessionSolves } from "../components/Practice";
import { PuzzlePicker } from "../components/PuzzlePicker";
import { Select } from "../components/Select";
import { Sheet } from "../components/Sheet";
import { LastSolveActions, SolveRow, TimesRowActions, useSolveMenu } from "../components/SolveMenus";
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { StopSurface, TimeEntryField, TimerSurface } from "../components/TimerSurface";
import { Btn, Label, Metrics, MiniBtn, PageHead, SkeletonLine, mono } from "../components/ui";

/** Replay pace of the scramble on the preview cube. */
const REPLAY_START_MS = 350, REPLAY_MOVE_MS = 120;
/** Wide screens keep the session list in a right column (`--times-width`). */
const TIMES_WIDTH = 300;

/** Cross + 1 scrambles belong to training; the timer's scramble menu leaves them out. */
const timerScrambles = (types: readonly ScrambleType[]) => types.filter(type => !type.startsWith("cross1-"));

function scrambleMoves(scramble: string, size: number | null): Move[] {
  if (!size || !scramble) return [];
  try { return parseAlg(scramble, size); } catch { return []; }
}

export function PlaygroundPage() {
  const context = useAtomValue(practiceContextAtom);
  const [showTimes, setShowTimes] = useState(false);
  // A new puzzle, mode or scramble type starts a fresh attempt and session.
  return <PlaygroundSession key={contextKey(context)} context={context} showTimes={showTimes} setShowTimes={setShowTimes} />;
}

function PlaygroundSession({ context, showTimes, setShowTimes }: { context: PracticeContext; showTimes: boolean; setShowTimes: (value: boolean) => void }) {
  const t = useTheme();
  const layout = useLayout();
  const { phone } = layout;
  const info = puzzleInfo(context.puzzle);
  const setScrambleType = useSetAtom(scrambleTypeAtom);
  const [entry, setEntry] = useAtom(timeEntryAtom);
  const [saving, setSaving] = useState(false);
  const [scramble, setScramble] = useAtom(playgroundScrambleAtom);
  const [solves, setSolves] = useSessionSolves("playground", context);
  // The time just recorded keeps its buttons under the timer until the next attempt or its deletion.
  const [lastSolveId, setLastSolveId] = useState<number | null>(null);
  // A solve that beats the all-time single, Ao5 or Ao12 of this context is praised for a moment.
  const [record, setRecord] = useState({ at: 0, message: "" });
  const { generating, slow, error: generationError, generate: generateNext } = useScrambleGeneration(context, setScramble);
  useEffect(() => { if (!scramble) void generateNext(); }, []);

  const onStop = useCallback(async (ms: number) => {
    // Casual timing records nothing: the time stays on screen and the next scramble comes up.
    if (entry === "casual") { setLastSolveId(null); void generateNext(); return; }
    setSaving(true);
    try {
      const sessionId = await ensureLaunchSession("playground", context);
      const solve = await api.addSolve({ sessionId, caseId: null, timeMs: ms, scramble, ...context });
      setSolves(s => [...s.filter(item => item.id !== solve.id), solve]);
      setLastSolveId(solve.id);
      // Records span every launch, unlike the listed session.
      const message = recordMessage(solveRecords((await api.solves("playground", Infinity, context.puzzle, context)).reverse(), solve.id));
      if (message) setRecord({ at: Date.now(), message });
      void generateNext();
    } finally { setSaving(false); }
  }, [scramble, context, generateNext, entry]);
  const timer = useTimer({ onStop, canStart: !saving && !generating && !!scramble && !generationError });
  // A typed time is saved like a timed one; a failed save keeps the time for a retry.
  const [typedError, setTypedError] = useState<{ message: string; ms: number } | null>(null);
  const submitTyped = (ms: number) => { setTypedError(null); onStop(ms).catch(error => setTypedError({ message: (error as Error).message, ms })); };
  const typing = entry === "typing";

  // Penalties and deletions in flight already show in the list and the figures.
  const { optimistic } = useSolveMenu();
  const shownSolves = useMemo(() => optimistic.size ? solves.flatMap(solve => {
    if (!optimistic.has(solve.id)) return [solve];
    const pending = optimistic.get(solve.id);
    return pending ? [{ ...solve, ...pending }] : [];
  }) : solves, [solves, optimistic]);
  const metrics = useMemo(() => sessionMetrics(shownSolves), [shownSolves]);
  const lastSolve = lastSolveId === null ? null : shownSolves.find(solve => solve.id === lastSolveId) ?? null;
  const { busy, running, locked } = usePracticeLock(timer, saving);
  const nextScramble = () => { if (!busy && !generating) void generateNext(); };

  // Scramble preview (`.prompt-visual`) and its replay, move by move.
  const cube = info.cubeSize;
  const moves = useMemo(() => scrambleMoves(scramble, cube), [scramble, cube]);
  const [replayAt, setReplayAt] = useState<number | null>(null);
  useEffect(() => setReplayAt(null), [scramble]);
  useEffect(() => {
    if (replayAt === null) return;
    const done = replayAt >= moves.length;
    const step = setTimeout(() => setReplayAt(done ? null : replayAt + 1), replayAt === 0 ? REPLAY_START_MS : done ? 0 : REPLAY_MOVE_MS);
    return () => clearTimeout(step);
  }, [replayAt, moves.length]);
  const previewState = useMemo(() => cube && scramble ? applyAlg(solved(cube), replayAt === null ? moves : moves.slice(0, replayAt)) : null, [cube, scramble, moves, replayAt]);
  const previewSize = phone ? (layout.height < 700 || layout.landscape ? 0 : 76) : layout.height < 700 ? 92 : layout.width < 1200 ? 112 : 132;
  const canReplay = !!cube && !!scramble && moves.length > 0 && !generating;
  const replay = () => { if (canReplay) setReplayAt(0); };

  // The time fills its area like the web's `clamp(52px, 19cqw, 110px)`, and shrinks when the area is short.
  const [area, setArea] = useState({ width: layout.width, height: 0 });
  const widthFont = phone ? Math.max(52, Math.min(area.width * 0.19, 110)) : Math.max(56, Math.min(area.width * 0.15, area.height * 0.36 || Infinity, 172));
  const actionsSpace = 18 + 14 + 30 + 12 + 24;
  const timerSize = Math.round(Math.max(34, Math.min(widthFont, area.height ? (area.height - actionsSpace) / 1.12 : widthFont)));
  const shortTimer = area.height > 0 && area.height < 190;

  const timesColumn = !phone && layout.width >= 1000 && !layout.landscape;
  const padding = layout.pagePadding;
  const promptFont = phone ? (scramble.length > 90 ? 15 : 19) : scramble.length > 220 ? 16 : scramble.length > 120 ? 20 : 27;
  const promptPadding = phone ? 14 : 22;
  const promptMax = Math.round(layout.height * (phone ? 0.4 : 0.44));
  const collapse = phone;
  const scrambleOptions = timerScrambles(info.scrambles).map(type => ({ value: type, label: scrambleLabel(type) }));

  const controls = <>
    <Select value={context.scrambleType} disabled={locked} accessibilityLabel="Scramble type" menuWidth={260} options={scrambleOptions} onChange={value => setScrambleType(value as ScrambleType)} />
    <Select value={entry} disabled={locked || !!typedError} accessibilityLabel="Time entry" minWidth={150} options={TIME_ENTRIES.map(item => ({ value: item.id, label: item.label }))} onChange={value => setEntry(value as TimeEntry)} />
    {!!cube && <Btn icon={IconUndo} iconOnly={collapse} label={collapse ? undefined : "Replay"} accessibilityLabel="Replay the scramble on the cube" disabled={!canReplay || busy} onPress={replay} />}
    <Btn icon={IconShuffle} iconOnly={collapse} label={collapse ? undefined : "New scramble"} accessibilityLabel="New scramble" disabled={busy || slow || !!timer.saveError} onPress={nextScramble} />
    {!timesColumn && <Btn icon={IconTimer} iconOnly={collapse} label={collapse ? undefined : "Times"} accessibilityLabel="Times" active={showTimes} disabled={busy} onPress={() => setShowTimes(true)} />}
  </>;

  const actions = lastSolve && !saving ? <LastSolveActions solve={lastSolve} /> : null;
  const scrollKey = `playground-times:${contextKey(context)}`;

  return <View style={styles.page}>
    <RunningFade hidden={running}>
      <PageHead title="Timer" sub={eventLabel(context.puzzle, context.solveMode)} padding={padding} right={<PuzzlePicker />} controls={controls} />
    </RunningFade>
    <View style={styles.body}>
      <View style={styles.stage}>
        <RunningFade hidden={running}>
          <View style={[styles.prompt, { borderColor: t.line, paddingHorizontal: phone ? 16 : 32, paddingVertical: promptPadding, maxHeight: promptMax, gap: phone ? 14 : 28 }]}>
            <View style={styles.promptMain}>
              <Label>{`Scramble · ${scrambleLabel(context.scrambleType)}`}</Label>
              <ScrollView style={{ maxHeight: promptMax - promptPadding * 2 - 22 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {generating && (slow || !scramble) || !scramble && !generationError
                  ? <View style={{ gap: promptFont * 0.55, paddingVertical: promptFont * 0.28 }}><SkeletonLine width="94%" height={promptFont} /><SkeletonLine width="72%" height={promptFont} /></View>
                  : generationError ? <View style={{ alignItems: "flex-start", gap: 6 }}><Text style={{ color: t.danger, fontSize: 13 }}>{generationError}</Text><MiniBtn label="Retry" onPress={() => void generateNext()} /></View>
                  : <AlgText alg={scramble} size={promptFont} lineHeight={Math.round(promptFont * 1.55)} />}
              </ScrollView>
            </View>
            {previewSize > 0 && previewState && <Pressable accessibilityRole="button" accessibilityLabel="Replay the scramble on the cube" disabled={!canReplay || busy} onPress={replay}>
              <StaticCubeSvg state={previewState} size={previewSize} />
            </Pressable>}
          </View>
        </RunningFade>
        <TouchArea timer={timer} enabled={!typing && !timer.saveError} style={styles.stageTouch}>
          <View style={styles.timer} onLayout={event => { const { width, height } = event.nativeEvent.layout; setArea(current => current.width === width && current.height === height ? current : { width, height }); }}>
            <Notice at={record.at} hidden={running} top={shortTimer ? 6 : 18} icon={<IconTrophy size={14} color={t.good} />} message={record.message} />
            {typing
              ? <TimeEntryField fontSize={timerSize} short={shortTimer} disabled={saving || generating || !scramble || !!generationError || !!typedError} error={typedError?.message} onRetry={() => typedError && submitTyped(typedError.ms)} onSubmit={submitTyped} actions={actions} />
              : <TimerSurface timer={timer} fontSize={timerSize} short={shortTimer} unsaved={entry === "casual"} actions={actions} />}
          </View>
          <RunningFade hidden={running}>
            <Metrics items={metrics} columns={phone || layout.width <= 1240 ? 4 : 8} dense valueSize={phone ? 15 : 18} />
          </RunningFade>
        </TouchArea>
      </View>
      {timesColumn && <RunningFade hidden={running} style={[styles.timesColumn, { borderColor: t.line }]}>
        <View style={styles.columnHead}>
          <Text style={[styles.columnTitle, { color: t.text }]}>Times</Text>
          <Text style={[mono(t, 12, "400"), { color: t.muted }]}>{shownSolves.length}</Text>
        </View>
        <TimesList solves={shownSolves} scrollKey={scrollKey} />
      </RunningFade>}
    </View>
    <Sheet open={showTimes && !timesColumn} onClose={() => setShowTimes(false)} title="Times" sub={String(shownSolves.length)} tall flush>
      <TimesList solves={shownSolves} scrollKey={scrollKey} />
    </Sheet>
    <StopSurface timer={timer} />
  </View>;
}

/** `.times-head` + `.times-list`: "# · time (comment) · +2 · DNF · delete · i", newest first. */
function TimesList({ solves, scrollKey }: { solves: SolveDto[]; scrollKey: string }) {
  const t = useTheme();
  const scroll = usePreservedList<SolveDto>(scrollKey);
  const data = useMemo(() => [...solves].reverse(), [solves]);
  return <View style={styles.times}>
    <View style={[styles.timesHead, { borderColor: t.line }]}>
      <Label style={{ width: 34 }}>#</Label>
      <Label>Time</Label>
    </View>
    <FlatList {...scroll} data={data} keyExtractor={solve => String(solve.id)} initialNumToRender={20} maxToRenderPerBatch={16} windowSize={5} scrollEventThrottle={64}
      style={styles.timesScroll} contentContainerStyle={styles.timesContent} showsVerticalScrollIndicator={false}
      ListEmptyComponent={<Text style={[styles.timesEmpty, { color: t.muted }]}>No solves in this session yet.</Text>}
      renderItem={({ item: solve, index }) => <SolveRow solve={solve} style={styles.timesRow}>
        <Text style={[mono(t, 12, "400"), styles.timesIndex, { color: t.muted }]}>{solves.length - index}</Text>
        <View style={styles.timesValue}>
          <Text numberOfLines={1} style={[mono(t, 14, "500"), solve.penalty === "dnf" && { color: t.danger }]}>{fmtSolve(solve.time_ms, solve.penalty)}</Text>
          {solve.comment ? <IconComment size={11} color={t.muted} /> : null}
        </View>
        <TimesRowActions solve={solve} />
      </SolveRow>}
    />
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0 },
  body: { flex: 1, minHeight: 0, flexDirection: "row" },
  /** `.stage`: prompt, timer and figures stacked; only the timer area flexes. */
  stage: { flex: 1, minWidth: 0, minHeight: 0 },
  stageTouch: { flex: 1, minHeight: 0 },
  /** `.prompt`: scramble text and the cube preview side by side, over a 1px line. */
  prompt: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1 },
  promptMain: { flex: 1, minWidth: 0, gap: 8 },
  /** `.timer`: the time in the middle of the remaining height. */
  timer: { flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  timesColumn: { width: TIMES_WIDTH, borderLeftWidth: 1, minHeight: 0 },
  columnHead: { flexDirection: "row", alignItems: "center", gap: 8, height: 36, paddingLeft: 18, paddingRight: 12, flexShrink: 0 },
  columnTitle: { fontSize: 13, fontWeight: "600" },
  times: { flex: 1, minHeight: 0 },
  timesHead: { flexDirection: "row", alignItems: "center", paddingTop: 10, paddingBottom: 7, paddingHorizontal: 18, borderBottomWidth: 1, flexShrink: 0 },
  timesScroll: { flex: 1, minHeight: 0 },
  timesContent: { paddingTop: 4, paddingHorizontal: 8, paddingBottom: 16 },
  timesEmpty: { paddingVertical: 14, paddingHorizontal: 10, fontSize: 12.5 },
  timesRow: { flexDirection: "row", alignItems: "center", height: 32, paddingHorizontal: 10, borderRadius: 0 },
  timesIndex: { width: 34 },
  timesValue: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6 },
});
