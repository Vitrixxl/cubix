import { useKeepAwake } from "expo-keep-awake";
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { Box, Check, ChevronLeft, ChevronRight, ChevronUp, CirclePlay, Eye, EyeOff, List, ListChecks, Pause, RotateCcw, Shuffle, SkipForward, Undo2, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Animated, Easing, Linking, Pressable, ScrollView, View } from "react-native";
import { effective, fmtSolve, fmtTime, plural } from "../../../src/client/lib/format";
import { learningGoalMet, pendingCases } from "../../../src/client/lib/learningGoal";
import { practiceSummary, trainingSessionRows } from "../../../src/client/lib/practiceSummary";
import { EMPTY_TRAINING_HISTORY, previousIndex, trainingHistoryReducer } from "../../../src/client/lib/trainingHistory";
import { nextRecognition, recognitionCases, recommendedWhy } from "../../../src/client/lib/trainingPicks";
import { combineAuf, compensateAuf, randomAuf } from "../../../src/shared/cube";
import { viewForStage } from "../../../src/shared/cubeDiagram";
import { puzzleInfo, type PracticeContext } from "../../../src/shared/puzzles";
import type { CaseDto, SolveDto } from "../../../src/shared/types";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { PushedBar } from "../components/AppBar";
import { CaseDiagram } from "../components/CaseDiagram";
import { Chip } from "../components/Chips";
import { CrossPractice } from "../components/CrossPractice";
import { Alg, Empty, Fade, Figure, HeadButton, Label, MenuItem, MoreMenu, Numeric, Segmented } from "../components/layout";
import {
  CubePreview, Hint, SaveError, Stage, StopSurface, TimerDigits, timerHint, useBackTo, useNotice, usePracticeLock, useSessionSolves, useShownSolves, useTimerChrome,
} from "../components/Practice";
import { LastSolveBar, SolveMenu } from "../components/SolveMenus";
import { ask } from "../components/Confirm";
import { SlideSwitch } from "../components/SlideSwitch";
import {
  LearnedSetup, TrainHome, freePicksAtom, recognitionBackAtom, recognitionSecondsAtom, trainPicksAtom, trainSetsAtom, useTrainingData,
} from "../components/TrainingSetup";
import { useLayout } from "../hooks/useLayout";
import { useTimer } from "../hooks/useTimer";
import { executableAlg, hintsForStage, maskForStage } from "../lib/caseState";
import { PlayerAlg, PlayerControls, PlayerCube, useAlgPlayer } from "../components/AlgPlayer";
import { ensureLaunchSession } from "../lib/launchSession";
import {
  casesAtom, crossTargetAtom, learnedCaseIdsAtom, learningGoalAtom, puzzleAtom, randomAufAtom, replaceRouteAtom, routeAtom, solveModeAtom,
  statsAtom, statsVersionAtom, trainingRunAtom, trainingSetupModeAtom, trainingStepAtom, userAtom, type TrainingRun,
} from "../state";
import { tr } from "../../../src/client/i18n";

export function TrainingPage() {
  const user = useAtomValue(userAtom);
  // Picks belong to an account: another one starts from its own.
  return <TrainingRoot key={user?.id ?? "guest"} />;
}

/**
 * The ways of training first (Learned on a screen of its own), then the training started: the learned cases' pool,
 * free practice, cross scrambles or a recognition run (web `trainingStep`). Each step slides in over the previous one.
 */
function TrainingRoot() {
  const puzzle = useAtomValue(puzzleAtom);
  const solveMode = useAtomValue(solveModeAtom);
  const [step, setStep] = useAtom(trainingStepAtom);
  const [setupMode, setSetupMode] = useAtom(trainingSetupModeAtom);
  const [run, setRun] = useAtom(trainingRunAtom);
  // Starting writes the target down: one read from the former first-block training stays an XCross.
  const [crossTarget, setCrossTarget] = useAtom(crossTargetAtom);
  const setPicks = useSetAtom(trainPicksAtom), setSets = useSetAtom(trainSetsAtom);
  const route = useAtomValue(routeAtom);
  const replaceRoute = useSetAtom(replaceRouteAtom);
  const data = useTrainingData();
  // Training cases from elsewhere (the catalogue, a course, the profile) drills those alone, their learned ones.
  const autostart = route.page === "training" && !!route.autostart;
  useEffect(() => {
    if (!autostart) return;
    setPicks([]); setSets([]); setRun("cases"); setStep("practice");
    replaceRoute({ page: "training" });
  }, [autostart]);
  const start = useCallback((kind: TrainingRun) => {
    if (kind === "cross") { if (puzzle !== "333") return; setCrossTarget(crossTarget); }
    // The recommended cases picked stay those of this start, whatever is recommended later.
    if (kind === "cases") setPicks(data.picks);
    setRun(kind); setStep("practice");
  }, [puzzle, crossTarget, data.picks]);
  // Leaving a training goes back to where it was started, leaving Learned to the list.
  const toSetup = useCallback(() => setStep("setup"), []);
  const toList = useCallback(() => setSetupMode(""), []);
  const practising = step === "practice" || autostart;
  const kind: TrainingRun = autostart ? "cases" : run === "cross" && puzzle !== "333" ? "cases" : run;
  const id = practising ? `practice:${kind}` : setupMode === "learned" ? "learned" : "list";
  return <SlideSwitch id={id} depth={practising ? 2 : setupMode === "learned" ? 1 : 0}>
    {practising
      ? kind === "cross" ? <CrossPractice key={solveMode} onBack={toSetup} />
        : kind === "recognition" ? <RecognitionRun key={puzzle} onBack={toSetup} />
        : <TrainingSession key={`${puzzle}:${solveMode}:${kind}`} free={kind === "free"} onBack={toSetup} />
      : setupMode === "learned" ? <LearnedSetup onBack={toList} onTrain={() => start("cases")} />
      : <TrainHome onOpen={setSetupMode} onStart={start} />}
  </SlideSwitch>;
}

/**
 * A training session, pushed from Training: the case on top with its tools, the timer in the middle, the last solve's
 * actions then Previous / Next case. The list icon pushes the session's screen. A tablet reads the case larger and
 * keeps the session in view: peeking above the bar (portrait), docked at the right (wide).
 */
function TrainingSession({ free, onBack }: { free: boolean; onBack: () => void }) {
  const { height, tablet, wide } = useLayout();
  const puzzle = useAtomValue(puzzleAtom);
  const cube = puzzleInfo(puzzle).cubeSize;
  const supportsAuf = !!cube;
  const solveMode = useAtomValue(solveModeAtom);
  const cases = useAtomValue(casesAtom);
  const data = useTrainingData();
  const freePicks = useAtomValue(freePicksAtom);
  const selected = useMemo(() => free ? freePicks.filter(id => cases.some(c => c.id === id)) : data.pool, [free, freePicks, cases, data.pool]);
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
  const [showCube, setShowCube] = useState(false);
  const [replay, setReplay] = useState(0);
  const [sessionOpen, setSessionOpen] = useState(false);
  // The time just recorded keeps its actions in the bar until the next attempt or its deletion.
  const [lastSolveId, setLastSolveId] = useState<number | null>(null);
  const [notice, showNotice] = useNotice();
  // The session belongs to this launch (see lib/launchSession).
  const context: PracticeContext = { puzzle, solveMode, scrambleType: "case" };
  const [solves, setSolves] = useSessionSolves("training", context);
  const shown = useShownSolves(solves);

  const pick = useCallback((pool: CaseDto[]) => {
    navigateCase({ type: "next", pool, sample: Math.random(), auf: useAuf && supportsAuf ? randomAuf() : "" });
    setRevealed(false);
  }, [useAuf, supportsAuf]);
  // A case that left the pool (no longer learned, or unpicked) moves on to another.
  useEffect(() => { if (!current || !selected.includes(current.c.id)) pick(selectedCases); }, [selectedCases, pick]);
  // Celebrate once every selected case is learned, whether marked here or from the case page.
  const store = useStore();
  useEffect(() => {
    const previous = store.get(learningGoalAtom);
    if (previous?.puzzle === puzzle && learningGoalMet(previous.pending, selected, learned)) showNotice(tr("Well done! Every selected case is learned."), Check);
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
  const timer = useTimer({ onStop, canStart: !saving && !!current && !sessionOpen });
  useTimerChrome(timer);
  const { busy, running } = usePracticeLock(timer, saving);
  useBackTo(sessionOpen ? () => setSessionOpen(false) : onBack, !busy);

  const undoLast = async () => {
    const last = solves.at(-1);
    if (!last || !await ask({ title: tr("Delete your last solve?"), action: tr("Delete") })) return;
    await api.deleteSolve(last.id);
    setSolves(s => s.filter(x => x.id !== last.id)); bumpStats(v => v + 1);
  };
  const lastSolve = lastSolveId === null ? null : shown.find(solve => solve.id === lastSolveId) ?? null;
  const primary = current?.c.algorithms[0];
  const shownSetup = current ? (cube ? combineAuf(current.c.setup, current.auf) : current.c.setup) : "";
  const shownAlgorithm = primary && current ? (cube ? compensateAuf(executableAlg(primary), current.auf) : executableAlg(primary)) : "";
  // Back through the cases drawn this session, those still in the pool only (as on the web).
  const canPrevious = previousIndex(caseHistory, selectedCases) !== -1;
  const previousCase = () => {
    if (busy || !canPrevious) return;
    navigateCase({ type: "previous", pool: selectedCases }); setRevealed(false); timer.reset();
  };
  const nextCase = () => { if (!busy) { pick(selectedCases); timer.reset(); } };
  const currentLearned = !!current && learned.has(current.c.id);
  const hasCube = !!cube && !!current && !current.c.diagram;
  const recommendation = current && !free ? data.recommended.find(r => r.id === current.c.id) : undefined;
  const promptFont = (shownSetup.length > 90 ? 15 : 18) + (tablet ? 4 : 0);
  const pictureSize = tablet ? (wide ? 140 : 150) : height < 760 ? 72 : 92;
  const sub = plural(selected.length, "case");
  const openCase = () => current && setRoute({ page: "algorithms", caseId: current.c.id });

  const picture = current && (hasCube && showCube
    ? <Pressable accessibilityRole="button" accessibilityLabel={tr("Replay the setup on the cube")} onPress={() => setReplay(n => n + 1)}>
      <CubePreview alg={shownSetup} cube={cube!} size={pictureSize} mask={maskForStage(current.c.stage)} view={viewForStage(current.c.stage)} replay={replay} />
    </Pressable>
    : <Pressable accessibilityRole="button" accessibilityLabel={tr("Open {0}", { 0: tr(current.c.name) })} disabled={busy} onPress={openCase}><CaseDiagram c={current.c} size={pictureSize} /></Pressable>);
  const prompt = current ? <>
    <View className="flex-row items-center gap-3">
      {picture}
      <View className="min-w-0 flex-1 gap-1">
        <Pressable disabled={busy} onPress={openCase} accessibilityRole="button" accessibilityLabel={tr("Open {0}", { 0: tr(current.c.name) })}>
          <Text numberOfLines={1} className={cn("text-[28px] leading-8 font-extrabold tracking-[-0.04em]", tablet && "text-[36px] leading-10")}>{tr(current.c.name)}</Text>
        </Pressable>
        <Text numberOfLines={1} className="text-sm text-muted-foreground">{tr(current.c.setLabel)}</Text>
        {recommendation && <Badge variant="accent" className="self-start rounded-full"><View className="size-1.5 rounded-full bg-primary" /><Text numberOfLines={1} className="text-xs font-semibold text-primary">{tr("Recommended")} · {recommendedWhy(recommendation)}</Text></Badge>}
      </View>
    </View>
    <View className="gap-1">
      <Label className="tracking-[1px] uppercase">{tr("Setup")}</Label>
      <Alg text={shownSetup} size={promptFont} />
    </View>
    {revealed && primary && <View className="gap-1">
      <Label className="tracking-[1px] uppercase">{tr("Algorithm")}</Label>
      <Alg text={shownAlgorithm} size={Math.max(15, promptFont - 3)} className="opacity-85" />
    </View>}
    <View className="flex-row flex-wrap gap-1.5">
      {primary && <Chip icon={revealed ? EyeOff : Eye} on={revealed} disabled={busy} onPress={() => setRevealed(v => !v)} accessibilityLabel={revealed ? tr("Hide solution") : tr("Show solution")}>{tr("Solution")}</Chip>}
      {primary?.youtube && <Chip icon={CirclePlay} onPress={() => void Linking.openURL(primary.youtube!)}>{tr("Video")}</Chip>}
      {hasCube && <Chip icon={Box} on={showCube} onPress={() => setShowCube(v => !v)}>{tr("3D cube")}</Chip>}
      <Chip icon={Check} on={currentLearned} success disabled={busy} onPress={() => toggleLearned(current.c.id)}
        accessibilityLabel={currentLearned ? tr("{0} learned", { 0: current.c.name }) : tr("Mark {0} learned", { 0: current.c.name })}>{tr("Learned")}</Chip>
    </View>
  </> : <View className="items-start gap-2 py-4">
    <Text className="text-xl font-extrabold tracking-tight">{free ? tr("Choose your cases") : tr("No learned case to train")}</Text>
    <Chip icon={ListChecks} on accessibilityLabel={tr("Choose cases")} onPress={onBack}>{tr("Choose")}</Chip>
  </View>;

  const caseScreen = <View className="flex-1">
    <Fade hidden={running}>
      <PushedBar title={tr("Session")} sub={sub} onBack={onBack}>
        {supportsAuf && <HeadButton icon={Shuffle} label={tr("Random AUF") + " " + (useAuf ? tr("· on") : tr("· off"))} active={useAuf} disabled={busy} onPress={() => setUseAuf(v => !v)} />}
        {!wide && <HeadButton icon={List} label={tr("Session")} disabled={busy} onPress={() => setSessionOpen(true)} />}
      </PushedBar>
    </Fade>
    <View className={cn("min-h-0 flex-1 px-4 pb-2", tablet && "px-7")}>
      <Stage timer={timer} disabled={!current || saving || !!timer.saveError} running={running} prompt={prompt}
        readout={area => <>
          <TimerDigits timer={timer} area={area} />
          <Hint notice={running ? null : notice} hidden={running}>{timerHint(timer, { disabled: !current && tr("Select cases to begin") })}</Hint>
          <SaveError timer={timer} />
          {!running && lastSolve && <Verdict solve={lastSolve} />}
        </>}
        bar={<View className={cn("gap-2", tablet && "flex-row items-center")}>
          {/* A tablet: the last solve's actions, then Previous (an icon) and Next case on the same row. */}
          <View className={cn(tablet && "min-w-0 flex-[4]")}><LastSolveBar solve={saving ? null : lastSolve} /></View>
          <View className={cn("flex-row gap-2", tablet && "flex-[3]")}>
            <Pressable accessibilityRole="button" accessibilityLabel={tr("Previous case")} disabled={busy || !canPrevious} onPress={previousCase}
              className={cn("h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-muted active:bg-muted/70", tablet && "w-14 flex-none", (busy || !canPrevious) && "opacity-40")}>
              <Icon as={ChevronLeft} size={18} />{!tablet && <Text className="text-[15px] font-bold">{tr("Previous")}</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={tr("Next case")} disabled={busy || !current} onPress={nextCase}
              className={cn("h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-primary active:bg-primary/85", (busy || !current) && "opacity-40")}>
              <Text className="text-[15px] font-bold text-primary-foreground">{tr("Next")}</Text><Icon as={ChevronRight} size={18} className="text-primary-foreground" />
            </Pressable>
          </View>
        </View>} />
    </View>
    {tablet && !wide && <SessionPeekCard solves={shown} pool={selectedCases} hidden={running} onPress={() => setSessionOpen(true)} />}
    {!wide && <StopSurface timer={timer} />}
  </View>;
  // Wide: the session stays docked at the right, faded while a solve runs.
  if (wide) return <View className="flex-1 flex-row">
    {caseScreen}
    <Fade hidden={running}>
      <SessionScreen solves={shown} pool={selectedCases} currentId={current?.c.id} onBack={() => {}} onChoose={onBack} onUndo={solves.length ? () => void undoLast() : undefined} docked />
    </Fade>
    <StopSurface timer={timer} />
  </View>;
  return <SlideSwitch id={sessionOpen ? "session" : "case"} depth={sessionOpen ? 1 : 0}>
    {sessionOpen
      ? <SessionScreen solves={shown} pool={selectedCases} currentId={current?.c.id} onBack={() => setSessionOpen(false)} onChoose={onBack} onUndo={solves.length ? () => void undoLast() : undefined} />
      : caseScreen}
  </SlideSwitch>;
}

/** The last attempt against its case's figures: how far from its mean, then its best and mean over its attempts. */
function Verdict({ solve }: { solve: SolveDto }) {
  const stats = useAtomValue(statsAtom);
  const st = solve.case_id ? stats.get(solve.case_id) : undefined, time = effective(solve.time_ms, solve.penalty);
  if (!st || st.mean == null) return null;
  const delta = time == null ? null : time - st.mean;
  return <View className="mt-2 flex-row items-center justify-center gap-2">
    {delta != null && <View className={cn("rounded-lg px-2 py-0.5", delta <= 0 ? "bg-success/15" : "bg-destructive/15")}>
      <Numeric className={cn("text-[13px] font-bold", delta <= 0 ? "text-success" : "text-destructive")}>{(delta <= 0 ? "−" : "+") + (Math.abs(delta) / 1000).toFixed(2)} s</Numeric>
    </View>}
    <Text numberOfLines={1} className="shrink text-sm text-muted-foreground">{tr("best {0} · mean {1} over {2}", { 0: fmtTime(st.best), 1: fmtTime(st.mean), 2: st.count })}</Text>
  </View>;
}

/**
 * The session peeking above the bar on a tablet in portrait: its four figures and its last attempts (each case and its
 * time), one tap from the whole session.
 */
function SessionPeekCard({ solves, pool, hidden, onPress }: { solves: SolveDto[]; pool: CaseDto[]; hidden: boolean; onPress: () => void }) {
  const cases = useAtomValue(casesAtom);
  const summary = useMemo(() => practiceSummary(solves), [solves]);
  const byId = useMemo(() => new Map(cases.map(c => [c.id, c])), [cases]);
  return <Fade hidden={hidden} className="w-full max-w-[620px] self-center px-4 pb-2">
    <Pressable accessibilityRole="button" accessibilityLabel={tr("Session times, {0}", { 0: plural(solves.length, "attempt") })} onPress={onPress}
      className="gap-3 rounded-[22px] border border-border bg-popover p-4 active:bg-muted">
      <View className="flex-row items-center gap-2">
        <Text className="min-w-0 flex-1 text-base font-extrabold">{tr("Session")} <Numeric className="text-base text-muted-foreground">{solves.length}</Numeric> <Text className="text-xs text-muted-foreground">{plural(pool.length, "case")}</Text></Text>
        <Icon as={ChevronUp} size={18} className="text-muted-foreground" />
      </View>
      <View className="flex-row gap-2">
        <Figure label={tr("Best")} value={fmtTime(summary.best)} tone="good" className="flex-1" />
        <Figure label={tr("Mean")} value={fmtTime(summary.mean)} className="flex-1" />
        <Figure label="Ao5" value={fmtTime(summary.ao5)} className="flex-1" />
        <Figure label="Ao12" value={fmtTime(summary.ao12)} className="flex-1" />
      </View>
      {solves.length > 0 && <View className="flex-row gap-2 overflow-hidden">
        {solves.slice(-9).reverse().map(v => {
          const c = v.case_id ? byId.get(v.case_id) : undefined;
          return <View key={v.id} className="w-[52px] items-center gap-0.5">
            {c ? <CaseDiagram c={c} size={36} /> : <View className="size-9" />}
            <Numeric numberOfLines={1} className={cn("text-xs font-bold", v.penalty === "dnf" ? "text-destructive" : v.penalty === "+2" ? "text-warning" : "")}>{fmtSolve(v.time_ms, v.penalty)}</Numeric>
          </View>;
        })}
      </View>}
    </Pressable>
  </Fade>;
}

/**
 * The session as a pushed screen: its four figures, the cases it drills set by set (the one now outlined) with the way
 * back to choosing them, then its cases from the slowest to the fastest, or its times.
 */
function SessionScreen({ solves, pool, currentId, onBack, onChoose, onUndo, docked = false }: {
  solves: SolveDto[]; pool: CaseDto[]; currentId?: string; onBack: () => void; onChoose: () => void; onUndo?: () => void;
  /** Docked at the right of a wide screen, beside the case, rather than pushed. */
  docked?: boolean;
}) {
  const cases = useAtomValue(casesAtom);
  const [tab, setTab] = useState<"cases" | "times">("cases");
  const summary = useMemo(() => practiceSummary(solves), [solves]);
  const rows = useMemo(() => {
    const tried = new Set(solves.map(s => s.case_id));
    return trainingSessionRows(cases.filter(c => tried.has(c.id)), solves).sort((a, b) => (b.mean ?? Infinity) - (a.mean ?? Infinity));
  }, [cases, solves]);
  const bySet = useMemo(() => {
    const sets = new Map<string, CaseDto[]>();
    for (const c of pool) sets.set(c.setLabel, [...sets.get(c.setLabel) ?? [], c]);
    return [...sets];
  }, [pool]);
  const figures: [string, string, string, string][] = [
    [tr("Best"), fmtTime(summary.best), "bg-success", "text-success"], [tr("Mean"), fmtTime(summary.mean), "bg-primary", ""],
    ["Ao5", fmtTime(summary.ao5), "bg-warning", ""], ["Ao12", fmtTime(summary.ao12), "bg-lilac", ""],
  ];
  const byId = new Map(cases.map(c => [c.id, c]));
  const title = <Text className="text-xl font-extrabold tracking-[-0.03em]">{tr("Session")} <Numeric className="text-base text-muted-foreground">{solves.length}</Numeric></Text>;
  const menu = <MoreMenu label={tr("Session")}>
    <MenuItem icon={Undo2} disabled={!onUndo} onPress={() => onUndo?.()}>{tr("Delete the last solve")}</MenuItem>
  </MoreMenu>;
  return <View className={docked ? "m-3 ml-0 w-[380px] flex-1 gap-2 rounded-[26px] border border-border bg-card p-4" : "flex-1"}>
    {docked ? <View className="flex-row items-center gap-2"><View className="min-w-0 flex-1">{title}</View>{menu}</View>
      : <PushedBar title={title} onBack={onBack}>{menu}</PushedBar>}
    <ScrollView className="min-h-0 flex-1" contentContainerClassName={docked ? "gap-3 pb-2" : "gap-3 px-4 pb-4"}>
      <Segmented label={tr("Session")} value={tab} onChange={setTab} options={[{ id: "cases", label: tr("By case") }, { id: "times", label: tr("Times") }]} />
      <View className="flex-row gap-1.5">
        {figures.map(([label, value, dot, tone]) => <View key={label} className="min-w-0 flex-1 gap-0.5 rounded-xl bg-muted px-2.5 py-2">
          <View className="flex-row items-center gap-1"><View className={cn("size-1.5 rounded-full", dot)} /><Text numberOfLines={1} className="text-xs text-muted-foreground">{label}</Text></View>
          <Numeric numberOfLines={1} className={cn("text-base font-extrabold", tone)}>{value}</Numeric>
        </View>)}
      </View>
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-extrabold">{tr("Cases")} <Numeric className="text-base text-muted-foreground">{pool.length}</Numeric></Text>
        <Chip icon={ListChecks} accessibilityLabel={tr("Choose cases")} onPress={onChoose}>{tr("Choose")}</Chip>
      </View>
      {bySet.map(([set, list]) => <View key={set} className="gap-1">
        <Text className="text-xs font-bold text-muted-foreground">{tr(set)} · <Numeric className="text-xs text-muted-foreground">{list.length}</Numeric></Text>
        <View className="flex-row flex-wrap gap-1">
          {list.map(c => <View key={c.id} accessibilityLabel={tr(c.name)} className={cn("rounded-xl border-2 p-0.5", c.id === currentId ? "border-primary" : "border-transparent")}><CaseDiagram c={c} size={36} /></View>)}
        </View>
      </View>)}
      <View className="h-px bg-border" />
      {tab === "cases" ? rows.length ? <View className="gap-1">
        <Text className="text-xs font-bold text-muted-foreground">{tr("Slowest to fastest · {0}", { 0: plural(solves.length, "attempt") })}</Text>
        {rows.map(({ c, count, mean, validCount }, i) => <View key={c.id} className={cn("flex-row items-center gap-3 rounded-xl px-2.5 py-2", c.id === currentId && "bg-muted")}>
          <CaseDiagram c={c} size={34} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-sm font-bold">{tr(c.name)}</Text>
            <Text numberOfLines={1} className="text-xs text-muted-foreground">{plural(count, "attempt")}{count > validCount ? " · " + tr("{0} DNF", { 0: count - validCount }) : ""} · {c.id === currentId ? tr("now") : tr(c.setLabel)}</Text>
          </View>
          <Numeric className={cn("text-base font-extrabold", rows.length > 1 && (i === 0 ? "text-destructive" : i === rows.length - 1 ? "text-success" : ""))}>{fmtTime(mean)}</Numeric>
        </View>)}
      </View> : <Empty title={tr("No attempt yet")} className="flex-none py-6" />
        : solves.length ? <View className="gap-1">
          {[...solves].reverse().map((v, i) => <SolveMenu key={v.id} solve={v} className="min-h-12 flex-row items-center gap-3 rounded-xl px-2.5 active:bg-muted/60">
            <Numeric className="w-8 text-xs text-muted-foreground">{solves.length - i}</Numeric>
            <Numeric className={cn("text-base font-bold", v.penalty === "dnf" ? "text-destructive" : v.penalty === "+2" ? "text-warning" : "")}>{fmtSolve(v.time_ms, v.penalty)}</Numeric>
            <Text numberOfLines={1} className="min-w-0 flex-1 text-right text-xs text-muted-foreground">{v.case_id ? tr(byId.get(v.case_id)?.name ?? v.case_id) : ""}</Text>
          </SolveMenu>)}
        </View> : <Empty title={tr("No attempt yet")} className="flex-none py-6" />}
    </ScrollView>
  </View>;
}

/**
 * A recognition run: three seconds counted down, then the learned cases of the set drawn at random (never the same
 * twice in a row), each shown alone for the seconds chosen, never named, until Close; then how many were done.
 */
function RecognitionRun({ onBack }: { onBack: () => void }) {
  useBackTo(onBack);
  useKeepAwake("cubix-recognition", { suppressDeactivateWarnings: true });
  const { width, height, tablet } = useLayout();
  const puzzle = useAtomValue(puzzleAtom);
  const cube = puzzleInfo(puzzle).cubeSize;
  const cases = useAtomValue(casesAtom);
  const data = useTrainingData();
  const seconds = useAtomValue(recognitionSecondsAtom);
  const back = useAtomValue(recognitionBackAtom);
  const useAuf = useAtomValue(randomAufAtom);
  const set = data.recognition?.set;
  // The run: its cases, fixed at its start, the one shown with its AUF, how many were done, and where it stands.
  // `paused`: the seconds the case was seen before a tap paused it to show its algorithm; `since`: when it showed.
  const [state, setState] = useState(() => ({ ids: set ? recognitionCases(cases, data.learned, set.id) : [], current: "", auf: "", paused: null as number | null, since: 0, done: 0, phase: "countdown" as "countdown" | "running" | "closed", left: 3 }));
  const draw = (last?: string) => ({ current: nextRecognition(state.ids, last) ?? "", auf: useAuf && cube ? randomAuf() : "", paused: null as number | null, since: Date.now() });
  const startOver = () => setState(s => ({ ...s, done: 0, phase: "countdown", left: 3 }));
  useEffect(() => {
    if (state.phase !== "countdown") return;
    const timeout = setTimeout(() => setState(s => s.left > 1 ? { ...s, left: s.left - 1 } : { ...s, ...draw(), phase: "running" }), 1000);
    return () => clearTimeout(timeout);
  }, [state.phase, state.left]);
  const next = () => setState(s => s.phase === "running" ? { ...s, ...draw(s.current), done: s.done + 1 } : s);
  // A first tap pauses the case and plays its algorithm; the next moves on (the bar running out moves on too).
  const press = () => setState(s => s.phase !== "running" ? s : s.paused === null ? { ...s, paused: (Date.now() - s.since) / 1000 } : { ...s, ...draw(s.current), done: s.done + 1 });
  // On the web (a keyboard), the space bar does as a tap.
  useEffect(() => {
    if (typeof document === "undefined") return; // Android: no keyboard events to listen to.
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat) { e.preventDefault(); e.stopPropagation(); press(); } };
    addEventListener("keydown", down, true);
    return () => removeEventListener("keydown", down, true);
  });
  const c = cases.find(x => x.id === state.current);
  const setup = c && cube ? combineAuf(c.setup, state.auf) : c?.setup ?? "",
    algorithm = c?.algorithms[0] ? (cube ? compensateAuf(executableAlg(c.algorithms[0]), state.auf) : executableAlg(c.algorithms[0])) : "";
  const size = Math.round(Math.max(160, Math.min(height * 0.45, width - 48, tablet ? 440 : 420)));
  const sub = set ? `${tr(set.label)} · ${plural(state.done, "case")}` : undefined;
  return <View className="flex-1">
    <PushedBar title={tr("Recognition")} sub={sub} onBack={onBack} />
    {!state.ids.length ? <Empty title={tr("Nothing learned yet")} />
      : state.phase === "countdown" ? <View className="min-h-0 flex-1 items-center justify-center" accessibilityLiveRegion="polite">
        <Numeric className="text-[140px] leading-[150px] font-extrabold tracking-[-0.05em] text-primary">{state.left}</Numeric>
      </View>
      : state.phase === "closed" ? <View className="min-h-0 flex-1 items-center justify-center gap-6">
        <View className="items-center gap-1">
          <Numeric className="text-[96px] leading-[104px] font-extrabold tracking-[-0.05em]">{state.done}</Numeric>
          <Text className="text-lg font-semibold text-muted-foreground">{tr(state.done === 1 ? "case done" : "cases done")}</Text>
        </View>
        <View className="flex-row gap-2">
          <Chip icon={RotateCcw} on onPress={startOver}>{tr("Again")}</Chip>
          <Chip accessibilityLabel={tr("Change set")} onPress={onBack}>{tr("Change")}</Chip>
        </View>
      </View>
      : state.paused !== null && c ? <View className="min-h-0 flex-1 items-center justify-center gap-4 px-4">
        <View className="flex-row items-center gap-2">
          <View className="flex-row items-center gap-1 rounded-full bg-muted px-2.5 py-1">
            <Icon as={Pause} size={12} className="text-muted-foreground" />
            <Numeric className="text-xs font-bold text-muted-foreground">{tr("{0} s", { 0: state.paused.toFixed(1) })}</Numeric>
          </View>
          <Text className="text-lg font-extrabold">{c.id}</Text>
          <Text numberOfLines={1} className="shrink text-muted-foreground">{tr(c.name !== c.id ? c.name : c.group)}</Text>
        </View>
        {cube && !c.diagram ? <RecognitionSolution key={"play" + state.done} algorithm={algorithm} setup={setup} cube={cube} size={Math.round(size * 0.85)} stage={c.stage} hints={back && hintsForStage(c.stage)} />
          : <Alg text={algorithm} size={22} />}
        <Chip icon={SkipForward} on onPress={press}>{tr("Next")}</Chip>
      </View>
      : <Pressable accessibilityRole="button" accessibilityLabel={tr("Show the algorithm")} onPress={press} className="min-h-0 flex-1 items-center justify-center gap-6 px-4">
        {c && (cube && !c.diagram
          ? <RecognitionCube key={"cube" + state.done} setup={setup} cube={cube} size={size} stage={c.stage} hints={back && hintsForStage(c.stage)} />
          : <CaseDiagram c={c} size={size} />)}
        <Countdown key={"bar" + state.done} seconds={seconds} onDone={next} width={tablet ? size : undefined} />
      </Pressable>}
    {state.phase !== "closed" && <View className={cn("flex-row justify-end px-4 pb-2", tablet && "px-7 pb-4")}>
      <Chip icon={X} onPress={() => setState(s => ({ ...s, phase: "closed" }))} className={tablet ? "h-12 px-5" : undefined}>{tr("Close")}</Chip>
    </View>}
  </View>;
}

/** A case in 3D, as the web's recognition shows it, its last layer's hidden stickers floating behind it with `hints`;
 * still, a tap going through to the run. */
function RecognitionCube({ setup, cube, size, stage, hints }: { setup: string; cube: number; size: number; stage: CaseDto["stage"]; hints: boolean }) {
  const player = useAlgPlayer("", cube, maskForStage(stage), { setup, hints });
  return player ? <View pointerEvents="none"><PlayerCube player={player} size={size} /></View>
    : <CubePreview alg={setup} cube={cube} size={size} mask={maskForStage(stage)} view={viewForStage(stage)} />;
}

/** The paused case's algorithm played on its cube from its setup, the move under way lit in the text, its controls under it. */
function RecognitionSolution({ algorithm, setup, cube, size, stage, hints }: { algorithm: string; setup: string; cube: number; size: number; stage: CaseDto["stage"]; hints: boolean }) {
  const player = useAlgPlayer(algorithm, cube, maskForStage(stage), { setup, hints, autoplay: 400 });
  if (!player) return <Alg text={algorithm} size={22} />;
  return <>
    <PlayerCube player={player} size={size} />
    <PlayerAlg player={player} text={algorithm} size={22} />
    <PlayerControls player={player} inline />
  </>;
}

/** A bar running out over `seconds`, then `onDone`; `width` sets it under the case on a tablet. */
function Countdown({ seconds, onDone, width }: { seconds: number; onDone: () => void; width?: number }) {
  const progress = useRef(new Animated.Value(1)).current;
  const done = useRef(onDone); done.current = onDone;
  useEffect(() => {
    const animation = Animated.timing(progress, { toValue: 0, duration: seconds * 1000, easing: Easing.linear, useNativeDriver: false });
    animation.start(({ finished }) => { if (finished) done.current(); });
    return () => animation.stop();
  }, []);
  return <View className={cn("h-1.5 overflow-hidden rounded-full bg-muted", !width && "w-full max-w-sm")} style={width ? { width } : undefined}>
    <Animated.View className="h-full rounded-full bg-primary" style={{ width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
  </View>;
}
