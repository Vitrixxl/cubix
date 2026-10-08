import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { Check, ChevronLeft, ChevronRight, CirclePlay, Eye, EyeOff, LayoutList, Shuffle, Undo2 } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { effective, fmtSolve, fmtTime, plural } from "../../../src/client/lib/format";
import { isReviewMode, learningModeForPuzzle, learningTrackOf, type LearningMode } from "../../../src/client/lib/dailyLearning";
import { learningGoalMet, pendingCases } from "../../../src/client/lib/learningGoal";
import { practiceSummary, trainingSessionRows } from "../../../src/client/lib/practiceSummary";
import { EMPTY_TRAINING_HISTORY, previousIndex, trainingHistoryReducer } from "../../../src/client/lib/trainingHistory";
import { combineAuf, compensateAuf, randomAuf } from "../../../src/shared/cube";
import { viewForStage } from "../../../src/shared/cubeDiagram";
import { puzzleInfo, type PracticeContext } from "../../../src/shared/puzzles";
import type { CaseDto, SolveDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { CaseDiagram } from "../components/CaseDiagram";
import { CrossPractice } from "../components/CrossPractice";
import { Alg, BackButton, Fade, HeadButton, Label, LearnToggle, MenuItem, Numeric, MoreMenu, Page, PageHead } from "../components/layout";
import { LearningGroups } from "../components/LearningGroups";
import {
  CubePreview, Hint, SaveError, SessionPeek, Stage, StopSurface, TimerDigits, timerHint, useBackTo, useNotice, usePracticeLock, useSessionSolves,
  useShownSolves, useTimerChrome, type Metric,
} from "../components/Practice";
import { Sheet, SheetScrollView } from "../components/Sheet";
import { LastSolveBar, SolveAction, SolveMenu } from "../components/SolveMenus";
import { ask } from "../components/Confirm";
import { SetupPage, TrainHome, useSetupModes, type DailyLearning } from "../components/TrainingSetup";
import { SlideSwitch } from "../components/SlideSwitch";
import { useDailyLearning } from "../hooks/useDailyLearning";
import { useLayout } from "../hooks/useLayout";
import { useTimer } from "../hooks/useTimer";
import { executableAlg, maskForStage, shortId } from "../lib/caseState";
import { ensureLaunchSession } from "../lib/launchSession";
import {
  casesAtom, learnedCaseIdsAtom, learningGoalAtom, puzzleAtom, randomAufAtom, replaceRouteAtom, routeAtom, selectedCaseIdsAtom, solveModeAtom,
  statsVersionAtom, trainingKindAtom, trainingSetupModeAtom, trainingStepAtom, userAtom,
} from "../state";
import { tr } from "../../../src/client/i18n";

export function TrainingPage() {
  const user = useAtomValue(userAtom);
  // Learning plans belong to an account: another one starts from its own.
  return <TrainingRoot key={user?.id ?? "guest"} />;
}

/** The mode trained last (web `lastSetupMode`), marked in the list. */
function lastMode(kind: string, puzzle: string, mode: LearningMode) {
  if (kind === "cross1" && puzzle === "333") return "cross1";
  return isReviewMode(mode) ? "review" : "practice";
}

/**
 * The ways to practise first, then the chosen one's setup, then the practice it started: cases of the catalogue or
 * cross + 1 scrambles (web `trainingStep`). Each step slides in over the previous one.
 */
function TrainingRoot() {
  const daily = useDailyLearning();
  const puzzle = useAtomValue(puzzleAtom);
  const solveMode = useAtomValue(solveModeAtom);
  const [step, setStep] = useAtom(trainingStepAtom);
  const [kind, setKind] = useAtom(trainingKindAtom);
  const [setupMode, setSetupMode] = useAtom(trainingSetupModeAtom);
  const route = useAtomValue(routeAtom);
  const replaceRoute = useSetAtom(replaceRouteAtom);
  const modes = useSetupModes();
  // Training a group or a case from the catalogue skips the setup screen.
  const autostart = route.page === "training" && !!route.autostart;
  useEffect(() => {
    if (!autostart) return;
    setKind("cases"); daily.setMode("practice"); setSetupMode("practice"); setStep("practice");
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
  // Leaving a session goes back to its setup, leaving a setup to the list.
  const toSetup = useCallback(() => setStep("setup"), []);
  const toList = useCallback(() => setSetupMode(""), []);
  const chosen = modes.find(m => m.id === setupMode);
  const practising = step === "practice" || autostart;
  const id = practising ? `practice:${kind === "cross1" && puzzle === "333" ? "cross1" : "cases"}` : chosen ? `setup:${chosen.id}` : "list";
  return <SlideSwitch id={id} depth={practising ? 2 : chosen ? 1 : 0}>
    {practising
      ? kind === "cross1" && puzzle === "333" && !autostart ? <CrossPractice key={solveMode} onBack={toSetup} /> : <TrainingSession key={`${puzzle}:${solveMode}`} daily={daily} onBack={toSetup} />
      : chosen ? <SetupPage mode={chosen} onBack={toList} onStart={start} />
      : <TrainHome last={lastMode(kind, puzzle, daily.mode)} onOpen={setSetupMode} />}
  </SlideSwitch>;
}

/** Case practice: the chosen cases one after the other, their setup, solution and session times. */
function TrainingSession({ daily, onBack }: { daily: DailyLearning; onBack: () => void }) {
  const { height } = useLayout();
  const puzzle = useAtomValue(puzzleAtom);
  const cube = puzzleInfo(puzzle).cubeSize;
  const supportsAuf = !!cube;
  const solveMode = useAtomValue(solveModeAtom);
  const cases = useAtomValue(casesAtom);
  const freeSelected = useAtomValue(selectedCaseIdsAtom);
  const [showGroups, setShowGroups] = useState(false);
  const [showTimes, setShowTimes] = useState(false);
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
  // The time just recorded keeps its actions in the bar until the next attempt or its deletion.
  const [lastSolveId, setLastSolveId] = useState<number | null>(null);
  const [notice, showNotice] = useNotice();
  // The session belongs to this launch; the sheet only lists its solves (see lib/launchSession).
  const context: PracticeContext = { puzzle, solveMode, scrambleType: "case" };
  const [solves, setSolves] = useSessionSolves("training", context);
  const shown = useShownSolves(solves);

  const pick = useCallback((pool: CaseDto[]) => {
    navigateCase({ type: "next", pool, sample: Math.random(), auf: useAuf && supportsAuf ? randomAuf() : "" });
    setRevealed(false);
  }, [useAuf, supportsAuf]);
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
  const timer = useTimer({ onStop, canStart: !saving && !!current });
  useTimerChrome(timer);
  const { busy, running, locked } = usePracticeLock(timer, saving);
  useBackTo(onBack, !busy);

  const undoLast = async () => {
    const last = solves.at(-1);
    if (!last || !await ask({ title: tr("Delete your last solve?"), text: tr("It goes from your times and your statistics, on every device."), action: tr("Delete") })) return;
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
  const setMode = (mode: LearningMode) => { if (!busy && !timer.saveError) { daily.setMode(mode); timer.reset(); } };
  const summary = useMemo(() => practiceSummary(shown), [shown]);
  const currentLearned = !!current && learned.has(current.c.id);
  const view = current ? viewForStage(current.c.stage) : "top";
  const hasCube = !!cube && !!current && !current.c.diagram;
  const promptFont = shownSetup.length > 90 ? 15 : 18;
  const previewSize = height < 760 ? 0 : 84;

  const prompt = current ? <>
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      <Pressable disabled={busy} onPress={() => setRoute({ page: "algorithms", caseId: current.c.id })} accessibilityRole="button" accessibilityLabel={tr("Open {0}", { 0: current.c.name })}>
        <Text className="text-lg font-semibold tracking-tight">{current.c.name}</Text>
      </Pressable>
      <Text numberOfLines={1} className="shrink text-sm text-muted-foreground">{learning ? tr(daily.status) : tr(current.c.setLabel) + (current.c.group && current.c.group !== current.c.setLabel ? " · " + tr(current.c.group) : "")}</Text>
    </View>
    <View className="gap-1.5">
      <Label>{tr("Setup")}</Label>
      <Alg text={shownSetup} size={promptFont} />
    </View>
    {revealed && primary && <View className="gap-1.5">
      <Label>{tr("Algorithm")}</Label>
      <Alg text={shownAlgorithm} size={Math.max(15, promptFont - 3)} className="opacity-85" />
    </View>}
    <View className="-ml-2.5 flex-row flex-wrap items-center gap-1">
      {primary && <Button variant="ghost" size="sm" className="h-11 gap-1.5 rounded-lg" disabled={busy} onPress={() => setRevealed(v => !v)}>
        <Icon as={revealed ? EyeOff : Eye} size={16} className="text-muted-foreground" />
        <Text className="text-sm text-muted-foreground">{revealed ? tr("Hide solution") : tr("Show solution")}</Text>
      </Button>}
      {primary?.youtube && <Button variant="ghost" size="sm" className="h-11 gap-1.5 rounded-lg" onPress={() => void Linking.openURL(primary.youtube!)}>
        <Icon as={CirclePlay} size={16} className="text-muted-foreground" /><Text className="text-sm text-muted-foreground">{tr("Video")}</Text>
      </Button>}
      <LearnToggle learned={currentLearned} disabled={busy} onPress={() => toggleLearned(current.c.id)} accessibilityLabel={currentLearned ? tr("{0} learned", { 0: current.c.name }) : tr("Mark {0} learned", { 0: current.c.name })} className="border-transparent px-3" />
    </View>
  </> : <View className="items-start gap-2 py-4">
    <Text className="text-lg font-semibold tracking-tight">{reviewing ? tr("No learned cases yet") : learning ? tr("Track complete") : tr("Choose your cases")}</Text>
    <Text className="text-sm text-muted-foreground">{learning ? tr(daily.status) : tr("Select the cases you want to practise.")}</Text>
    <View className="mt-2 flex-row gap-2">
      {!learning && <Button onPress={onBack}><Text>{tr("Choose cases")}</Text></Button>}
      {track && !reviewing && daily.trackLearned > 0 && <Button disabled={locked} onPress={() => setMode(`review:${track}`)}><Text>{tr("Train learned")}</Text></Button>}
    </View>
  </View>;

  const visual = current && previewSize > 0 ? (hasCube
    ? <Pressable accessibilityRole="button" accessibilityLabel={tr("Replay the setup on the cube")} onPress={() => setReplay(n => n + 1)}>
      <CubePreview alg={shownSetup} cube={cube!} size={previewSize} mask={maskForStage(current.c.stage)} view={view} replay={replay} />
    </Pressable>
    : <CaseDiagram c={current.c} size={previewSize} />) : null;
  const peek: Metric[] = [["Best", fmtTime(summary.best), "good"], ["Mean", fmtTime(summary.mean), ""]];

  return <Page className="pb-0">
    <Fade hidden={running}>
      <PageHead lead={<BackButton label={tr("Change what to train")} onPress={onBack} />}
        title={track ? tr("Learn {0}", { 0: track }) : reviewing ? tr("Review") : tr("Free practice")}
        sub={track ? tr("Training · one new case a day") : reviewing ? tr("Training · every learned case") : tr("Training · {0}", { 0: plural(selected.length, "case") })}>
        <HeadButton icon={ChevronLeft} label={tr("Previous case")} disabled={busy || !canPrevious} onPress={previousCase} />
        <MoreMenu>
          {learning && !reviewing && <MenuItem icon={LayoutList} disabled={locked} onPress={() => setShowGroups(true)}>{tr("Group order")}</MenuItem>}
          {track && <MenuItem icon={Check} disabled={locked || !reviewing && !daily.trackLearned} onPress={() => setMode(reviewing ? track : `review:${track}`)}>{reviewing ? tr("Learn {0}", { 0: track }) : tr("Train learned")}</MenuItem>}
          {supportsAuf && <MenuItem icon={Shuffle} disabled={busy} onPress={() => setUseAuf(v => !v)}>{tr("Random AUF") + " " + (useAuf ? tr("· on") : tr("· off"))}</MenuItem>}
          <MenuItem icon={Undo2} disabled={busy || !solves.length} onPress={() => void undoLast()}>{tr("Undo the last time")}</MenuItem>
        </MoreMenu>
      </PageHead>
    </Fade>
    <Stage timer={timer} disabled={!current || saving || !!timer.saveError} running={running} prompt={prompt} visual={visual}
      readout={area => <>
        <TimerDigits timer={timer} area={area} />
        <Hint notice={running ? null : notice} hidden={running}>{timerHint(timer, { disabled: !current && tr("Select cases to begin") })}</Hint>
        <SaveError timer={timer} />
      </>}
      bar={<LastSolveBar solve={saving ? null : lastSolve}
        extra={!learning || reviewing ? <SolveAction icon={ChevronRight} label={tr("Next case")} disabled={busy || !current} onPress={nextCase} /> : undefined} />} />
    <SessionPeek figures={peek} count={shown.length} noun="attempt" onPress={() => setShowTimes(true)} hidden={running} />
    <SessionSheet open={showTimes} onClose={() => setShowTimes(false)} selectedCases={selectedCases} solves={shown} onUndo={solves.length ? () => void undoLast() : undefined} />
    <Sheet open={showGroups} onClose={() => setShowGroups(false)} title={tr("Group order")} description={tr("Learn {0}: drag the families into the order you want to learn them", { 0: track ?? "" })} contentPanning={false}>
      {showGroups && <LearningGroups key={daily.mode} groups={daily.groups} disabled={locked} onReorder={daily.reorderGroups} />}
    </Sheet>
    <StopSurface timer={timer} />
  </Page>;
}

/**
 * The training session in a sheet, grouped by case: the case's picture and short name, then its times as chips, the
 * fastest in green. A chip opens its solve; held, its menu.
 */
function SessionSheet({ open, onClose, selectedCases, solves, onUndo }: { open: boolean; onClose: () => void; selectedCases: CaseDto[]; solves: SolveDto[]; onUndo?: () => void }) {
  const cases = useAtomValue(casesAtom);
  const rows = useMemo(() => {
    const ids = new Set([...selectedCases.map(c => c.id), ...solves.map(s => s.case_id).filter((id): id is string => !!id)]);
    return trainingSessionRows(cases.filter(c => ids.has(c.id)), solves);
  }, [cases, selectedCases, solves]);
  return <Sheet open={open} onClose={onClose} contentClassName="px-0"
    title={<Text accessibilityRole="header" className="text-base font-semibold">{tr("Session")}{" "}<Numeric className="text-base font-normal text-muted-foreground">{solves.length}</Numeric></Text>}
    description={tr("Tap a time for its details · hold it for +2, DNF or delete")}
    right={onUndo ? <Button variant="ghost" size="sm" className="h-9 gap-1.5" onPress={onUndo}><Icon as={Undo2} size={15} className="text-muted-foreground" /><Text className="text-sm text-muted-foreground">{tr("Undo")}</Text></Button> : null}>
    <SheetScrollView contentContainerClassName="gap-1 px-3 pb-4">
      {rows.map(({ c, solves: list, best: fastest, mean: average, validCount }) => <View key={c.id} className="flex-row items-start gap-3 rounded-lg px-2 py-2">
        <View className="w-11 items-center gap-1">
          <CaseDiagram c={c} size={40} />
          <Text numberOfLines={1} className="text-xs text-muted-foreground">{shortId(c)}</Text>
        </View>
        <View className="min-w-0 flex-1 gap-1.5 pt-0.5">
          {!list.length ? <Text className="text-sm text-muted-foreground/60">{tr("No attempt yet")}</Text> : <>
            {validCount > 1 && <Numeric className="text-xs text-muted-foreground">{tr("mean {0}", { 0: fmtTime(average) })}</Numeric>}
            <View className="flex-row flex-wrap gap-1.5">
              {[...list].reverse().map(v => <SolveMenu key={v.id} solve={v} className="h-9 justify-center rounded-md bg-muted px-2.5 active:bg-muted/70">
                <Numeric className={cn("text-sm", v.penalty === "dnf" ? "text-destructive" : effective(v.time_ms, v.penalty) === fastest ? "text-success" : v.penalty === "+2" ? "text-warning" : "")}>{fmtSolve(v.time_ms, v.penalty)}</Numeric>
              </SolveMenu>)}
            </View>
          </>}
        </View>
      </View>)}
    </SheetScrollView>
  </Sheet>;
}
