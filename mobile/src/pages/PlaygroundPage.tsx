import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Bluetooth, CalendarDays, ChevronDown, Copy, Hourglass, Pencil, Plus, Shuffle, SlidersHorizontal, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { effective, fmtSolve, fmtTime, INSPECTIONS, TIME_ENTRIES } from "../../../src/client/lib/format";
import { attemptTexts, roundAttempts, roundResult, versusRecord } from "../../../src/client/lib/compSim";
import { recordMessage, solveRecords } from "../../../src/client/lib/personalBest";
import { AVERAGE_SIZES, averageFigure, DEFAULT_FIGURES, figureLabel, FIGURE_LIMIT, sessionFigures, shownFigures } from "../../../src/client/lib/practiceSummary";
import { mbldLimitMs, mbldValue, scrambleList } from "../../../src/client/lib/wca";
import type { AddSolveBody } from "../../../src/client/api-client";
import { INSPECTION_DNF_MS, INSPECTION_MS } from "../../../src/client/lib/practiceTimer";
import { attemptMode, contextKey, eventOf, puzzleInfo, relayOf, scrambleLabel, type PracticeContext } from "../../../src/shared/puzzles";
import type { Penalty, SolveDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { useTimer, type TimerApi } from "../hooks/useTimer";
import { useSmartCubeOn, useSmartCubeSolve } from "../hooks/useSmartCube";
import { devicesAtom } from "../components/Devices";
import { ensureLaunchSession } from "../lib/launchSession";
import { mbldCubesAtom, metronomeAtom, phasesAtom, playgroundScrambleAtom, practiceContextAtom, timeEntryAtom } from "../state";
import { phaseCount, phaseNames } from "../../../src/client/lib/phases";
import { PhaseSplits } from "../components/analysis/steps";
import { FewestMovesAttempt, MultiBlindResult, ScrambleExportSheet, ScrambleLines } from "../components/Attempts";
import { metronome } from "../scrambler";
import { Alg, Fade, Figure, HeadButton, Numeric } from "../components/layout";
import { ask } from "../components/Confirm";
import { toastAtom } from "../components/Toast";
import { compSimAtom, endCompSim, roundOf, startCompSim, type Round } from "../lib/compSim";
import {
  AverageWindow, Digits, digitsSize, Hint, SaveError, Stage, StopSurface, TimerDigits, TypedTime, timerHint,
  useNotice, usePracticeLock, useScrambleGeneration, useSessionSolves, useShownSolves, useTimerChrome,
} from "../components/Practice";
import { AppBar, SectionTabs } from "../components/AppBar";
import { Caption, inspectionAtom, Pill, scrambleExportAtom, sessionSheetAtom, timerFiguresAtom } from "../components/PuzzlePicker";
import { rememberTimerSession, resumeTimerSession, Stat, TimesPanel, TimesSheet } from "../components/TimesSheet";
import { LastSolveBar, PillAction } from "../components/SolveMenus";
import { Sheet, SheetInput } from "../components/Sheet";
import { useLayout } from "../hooks/useLayout";
import { useTourTarget } from "../tour";
import { said, tr } from "../../../src/client/i18n";

/** The timer: a new puzzle, mode or scramble type starts a fresh attempt and session (or the one it showed last). */
export function PlaygroundPage() {
  const context = useAtomValue(practiceContextAtom);
  resumeTimerSession(context);
  // A competition simulation takes the timer while its session is the timer's.
  const round = roundOf(useAtomValue(compSimAtom), context);
  return round ? <CompSimRound key={round.session} context={context} round={round} /> : <TimerSession key={contextKey(context)} context={context} />;
}

/**
 * A competition simulation's round: the attempt, its scramble and the timer alone, the WCA inspection always (but
 * blindfolded); each attempt signed by its judge (as timed, +2 or DNF) before the next scramble; then its result.
 */
function CompSimRound({ context, round }: { context: PracticeContext; round: Round }) {
  const setRound = useSetAtom(compSimAtom), toast = useSetAtom(toastAtom);
  const inspection = useAtomValue(inspectionAtom);
  const { height, tablet } = useLayout();
  const [solves, setSolves] = useSessionSolves("playground", context);
  // The attempt's scramble lives with the round: leaving the timer and coming back keeps it.
  const scramble = round.scramble ?? "";
  const setScramble = useCallback((next: string) => setRound(r => r && { ...r, scramble: next }), [setRound]);
  const [saving, setSaving] = useState(false);
  const { generating, error: generationError, generate } = useScrambleGeneration(context, setScramble);
  useEffect(() => { if (!round.scramble) void generate(); }, []);
  const attempts = roundAttempts(round.format), over = solves.length >= attempts, pending = round.pending;
  const blind = context.solveMode === "blindfolded";
  // An attempt waits for its judge; a DNF (an inspection past 17 seconds) has nothing to sign and is recorded at once.
  const onStop = (ms: number, penalty?: Penalty, memo?: number) => {
    const attempt = { ms, penalty: penalty ?? "none", memo };
    if (attempt.penalty === "dnf") void judge("dnf", attempt);
    else setRound(r => r && { ...r, pending: attempt });
  };
  const timer = useTimer({ onStop, canStart: !pending && !over && !saving && !generating && !!scramble && !generationError, inspection: !blind, memo: blind });
  useTimerChrome(timer);
  const { running } = usePracticeLock(timer, saving);
  async function judge(penalty: Penalty, attempt = pending) {
    if (!attempt || saving) return;
    setSaving(true);
    try {
      const solve = await api.addSolve({ sessionId: round.session, caseId: null, timeMs: attempt.ms, scramble, ...context, ...(penalty !== "none" ? { penalty } : {}), ...(attempt.memo !== undefined ? { memoMs: attempt.memo } : {}) });
      setSolves(list => [...list.filter(item => item.id !== solve.id), solve]);
      setRound(r => r && { ...r, pending: null, scramble: undefined });
      // A DNF recorded at once stays on screen until the next attempt.
      if (attempt === pending) timer.reset();
      if (solves.length + 1 < attempts) void generate();
    } catch (error) {
      toast({ title: (error as Error).message });
      // A DNF not saved waits for its judge, to be signed again.
      if (attempt !== pending) setRound(r => r && { ...r, pending: attempt });
    } finally { setSaving(false); }
  }
  // The timer resumes the round's session after a restart, and the one before once it is left.
  useEffect(() => rememberTimerSession(context, round.session), [round.session]);
  const leave = async () => {
    if (over || await ask({ title: tr("Leave the round?"), text: tr("Its attempts stay in its session."), action: tr("Leave"), destructive: false })) rememberTimerSession(context, await endCompSim(context, round));
  };
  const promptFont = Math.round((/\+\+|--/.test(scramble) ? 13 : scramble.length > 90 ? 16 : 20) * (tablet ? 1.3 : 1));
  const inspecting = timer.inspectedAt !== undefined && timer.phase !== "running";
  const hint = blind && timer.phase === "running"
    ? timer.memo === undefined ? tr("Tap when memorised") : tr("Memo {0} · {1}", { 0: fmtTime(timer.memo), 1: tr("Tap to stop") })
    : timerHint(timer, { disabled: !scramble || generating ? tr("One moment…") : false });
  return <View className="flex-1">
    <Fade hidden={running}>
      <AppBar title={over ? tr("Comp sim") : tr("Attempt {0} of {1}", { 0: solves.length + 1, 1: attempts })}>
        <HeadButton icon={X} label={over ? tr("Done") : tr("Leave the round")} onPress={() => void leave()} />
      </AppBar>
    </Fade>
    <View className={cn("min-h-0 flex-1 px-4 pt-2 pb-3", tablet && "px-7 pt-4")}>
      {over ? <RoundResult round={round} solves={solves} onAgain={() => startCompSim(context).catch(error => toast({ title: (error as Error).message }))} onDone={() => void leave()} />
        : <Stage timer={timer} disabled={!!pending} running={running}
          prompt={<View className="overflow-hidden" style={{ maxHeight: Math.round(height * 0.3) }}>
            {!scramble || generating
              ? <View accessibilityLabel={tr("Generating a scramble")} className="gap-2"><Skeleton className="w-[92%]" style={{ height: promptFont * 1.2 }} /><Skeleton className="w-[58%]" style={{ height: promptFont * 1.2 }} /></View>
              : generationError ? <Alert variant="destructive" action={<Button size="sm" variant="outline" onPress={() => void generate()}><Text>{tr("Retry")}</Text></Button>}>{generationError}</Alert>
              : <Alg text={scramble} size={promptFont} />}
          </View>}
          readout={area => <View className="w-full items-center">
            {pending ? <Digits text={fmtSolve(pending.ms, pending.penalty)} phase="idle" size={digitsSize(area, 6)} />
              : inspecting ? <InspectionDigits timer={timer} area={area} show speak={inspection === "voice" || inspection === "both"} />
              : <TimerDigits timer={timer} area={area} />}
            {!pending && <Hint hidden={running && !blind}>{hint}</Hint>}
          </View>}
          bar={<Fade hidden={!pending}>
            {/* The judge's signature: as timed (with the inspection's penalty), +2 or DNF. */}
            <View className="flex-row gap-2" accessibilityRole="toolbar" accessibilityLabel={tr("Sign the attempt")}>
              <Button className="h-12 flex-1 rounded-full" disabled={saving} accessibilityLabel={tr("As timed")} onPress={() => pending && void judge(pending.penalty)}><Text>{tr("OK")}</Text></Button>
              {/* A penalty the inspection already gave leaves nothing to add. */}
              <Button variant="secondary" className="h-12 flex-1 rounded-full" disabled={saving || pending?.penalty !== "none"} accessibilityLabel={tr("+2 penalty")} onPress={() => void judge("+2")}><Text>+2</Text></Button>
              <Button variant="secondary" className="h-12 flex-1 rounded-full" disabled={saving || pending?.penalty === "dnf"} accessibilityLabel={tr("Did not finish")} onPress={() => void judge("dnf")}><Text>{tr("DNF")}</Text></Button>
            </View>
          </Fade>} />}
    </View>
    <StopSurface timer={timer} />
  </View>;
}

/** The round's result as WCA lists it: what it ranks by, its attempts (an average of 5's best and worst in parentheses), its best single and the record before it. */
function RoundResult({ round, solves, onAgain, onDone }: { round: Round; solves: SolveDto[]; onAgain: () => void; onDone: () => void }) {
  const times = solves.map(v => effective(v.time_ms, v.penalty)), r = roundResult(round.format, times), bo3 = round.format === "bo3";
  const versus = versusRecord(r.result, round.record);
  return <View className="flex-1 items-center justify-center gap-6">
    <Figure label={bo3 ? tr("Best") : round.format === "ao5" ? "Ao5" : "Mo3"} value={fmtTime(r.result, { blank: tr("DNF") })} size="xl" className="items-center" />
    <View className="flex-row flex-wrap justify-center gap-x-4">
      {attemptTexts(times, r.dropped).map((text, i) => <Numeric key={i} className="text-lg text-muted-foreground">{text}</Numeric>)}
    </View>
    <View className="flex-row gap-10">
      <Figure label={bo3 ? "Mo3" : tr("Best")} value={fmtTime(bo3 ? r.average : r.best, { blank: tr("DNF") })} />
      {round.record !== null && <Figure label="PB" value={<>{fmtTime(round.record)}{versus && <Numeric className={cn("text-sm", versus.faster ? "text-success" : "text-destructive")}> {versus.text}</Numeric>}</>} />}
    </View>
    <View className="flex-row gap-2">
      <Button variant="secondary" className="rounded-full" accessibilityLabel={tr("Another round")} onPress={onAgain}><Text>{tr("Again")}</Text></Button>
      <Button className="rounded-full" onPress={onDone}><Text>{tr("Done")}</Text></Button>
    </View>
  </View>;
}

/** Figures of the session card, as many to a row as fit: up to four, six in two rows of three (up to six on a tablet). */
const WIDTH: Record<number, string> = { 1: "w-full", 2: "w-1/2", 3: "w-1/3", 4: "w-1/4", 5: "w-1/5", 6: "w-1/6" };
/** The colour dot of a figure of the session card. */
const dotOf = (id: string) => id === "best" || id.endsWith(":best") ? "bg-success" : id === "worst" || id.endsWith(":worst") ? "bg-destructive"
  : id === "ao5" || id === "mo3" ? "bg-primary" : id === "ao12" ? "bg-chart-2" : id === "mean" ? "bg-warning" : /^ao\d+$/.test(id) ? "bg-primary" : "bg-muted-foreground";

function TimerSession({ context }: { context: PracticeContext }) {
  const { height, tablet, wide } = useLayout();
  // A tablet held upright (820×1180) lists the session's times under the timer; a wide screen docks them beside it.
  const listed = tablet && !wide && height >= 1100;
  const info = puzzleInfo(context.puzzle);
  const entry = useAtomValue(timeEntryAtom);
  const [inspection, setInspection] = useAtom(inspectionAtom);
  // The hourglass switches back on the last way chosen (spoken, on screen or both).
  const lastInspection = useRef<typeof inspection>("both");
  if (inspection !== "off") lastInspection.current = inspection;
  const figureIds = useAtomValue(timerFiguresAtom);
  const openSheet = useSetAtom(sessionSheetAtom), openDevices = useSetAtom(devicesAtom);
  const [saving, setSaving] = useState(false);
  const [scramble, setScramble] = useAtom(playgroundScrambleAtom);
  const [solves, setSolves] = useSessionSolves("playground", context);
  const [times, setTimes] = useState<null | "list" | "calendar">(null);
  // Docked beside the timer on a wide screen, the session shows its calendar in place of its times.
  const [panelCalendar, setPanelCalendar] = useState(false);
  const [editingFigures, setEditingFigures] = useState(false);
  // The time just recorded keeps its actions in the bar until the next attempt or its deletion.
  const [lastSolveId, setLastSolveId] = useState<number | null>(null);
  const [notice, showNotice] = useNotice();
  const { generating, slow, error: generationError, generate: generateNext } = useScrambleGeneration(context, setScramble);
  useEffect(() => { if (!scramble) void generateNext(); }, []);
  // Blindfolded solves split the memorisation from the execution and have no inspection (it is part of the time).
  // Fewest Moves is written, not timed (`FewestMovesAttempt`); a Multi-Blind attempt is timed for all its cubes, then
  // waits for the cubes solved (`MultiBlindResult`).
  const fmc = context.solveMode === "fewest-moves", multi = context.solveMode === "multi-blind";
  const blind = context.solveMode === "blindfolded", typing = entry === "typing" && !fmc;
  const inspected = !blind && !typing && !attemptMode(context.solveMode) && inspection !== "off";
  const bpm = useAtomValue(metronomeAtom), cubes = useAtomValue(mbldCubesAtom);
  const [mbld, setMbld] = useState<{ ms: number; cubes: number } | null>(null);
  const toast = useSetAtom(toastAtom);
  const [exporting, setExporting] = useAtom(scrambleExportAtom);

  const cube = useRef<{ take: () => string | null } | null>(null);
  const onStop = useCallback(async (ms: number, penalty?: Penalty, memo?: number, result?: Pick<AddSolveBody, "solution" | "moves" | "cubesSolved" | "cubesAttempted" | "splits">) => {
    // Casual timing records nothing: the time stays on screen and the next scramble comes up.
    if (entry === "casual") { setLastSolveId(null); void generateNext(); return; }
    if (multi && !result) { setMbld({ ms, cubes: scrambleList(scramble).length }); return; }
    setSaving(true);
    try {
      const sessionId = await ensureLaunchSession("playground", context);
      rememberTimerSession(context, sessionId);
      // A solve turned on a connected cube keeps its turns.
      const solution = cube.current?.take();
      const solve = await api.addSolve({ sessionId, caseId: null, timeMs: ms, scramble, ...context, ...(penalty && penalty !== "none" ? { penalty } : {}), ...(memo !== undefined ? { memoMs: memo } : {}), ...(solution ? { solution } : {}), ...result });
      setSolves(s => [...s.filter(item => item.id !== solve.id), solve]);
      setLastSolveId(solve.id);
      // Records span every session, unlike the listed one.
      const message = recordMessage(solveRecords((await api.solves("playground", Infinity, context.puzzle, context)).reverse(), solve.id));
      if (message) showNotice(message);
      void generateNext();
    } finally { setSaving(false); }
  }, [scramble, context, generateNext, entry, showNotice, multi]);
  // Each tap of a running solve but the last ends a phase (src/client/lib/phases).
  const phaseSetting = useAtomValue(phasesAtom), cubeOn = useSmartCubeOn(), phases = blind || typing || attemptMode(context.solveMode) || cubeOn && context.puzzle === "333" ? 1 : phaseCount(phaseSetting);
  const timer = useTimer({ onStop: (ms, penalty, memo, splits) => onStop(ms, penalty, memo, splits ? { splits } : undefined), canStart: !saving && !generating && !!scramble && !generationError && !fmc && !mbld, inspection: inspected, memo: blind, phases });
  const running = timer.phase === "running";
  // The metronome ticks while a solve runs.
  useEffect(() => (running && bpm ? metronome(bpm) : undefined), [running, bpm]);
  // A Multi-Blind attempt stops at its time limit (H1b): the limit is its time.
  useEffect(() => {
    if (!running || !multi) return;
    const limit = mbldLimitMs(scrambleList(scramble).length),
      wait = setTimeout(() => timer.finish(limit), Math.max(0, limit - (performance.now() - timer.startedAt)));
    return () => clearTimeout(wait);
  }, [running, multi]);
  // Another count of cubes: an attempt of as many scrambles.
  useEffect(() => { if (multi && scramble && scrambleList(scramble).length !== cubes) void generateNext(); }, [cubes]);
  const saveMultiBlind = (solved: number) => {
    if (!mbld) return;
    setMbld(null);
    const value = mbldValue(solved, mbld.cubes, mbld.ms);
    onStop(mbld.ms, value === null ? "dnf" : "none", undefined, { cubesSolved: solved, cubesAttempted: mbld.cubes }).catch(error => toast({ title: (error as Error).message }));
  };
  useTimerChrome(timer);
  // A connected cube times the 3×3's solves itself: its first turn once scrambled starts, the solved cube stops.
  const smart = useSmartCubeSolve(timer, scramble, context.puzzle === "333" && !blind && !typing && !attemptMode(context.solveMode));
  cube.current = smart;
  // A typed time is saved like a timed one; a failed save keeps the time for a retry.
  const [typedError, setTypedError] = useState<{ message: string; ms: number; penalty: Penalty } | null>(null);
  const submitTyped = (ms: number, penalty: Penalty) => { setTypedError(null); onStop(ms, penalty).catch(error => setTypedError({ message: (error as Error).message, ms, penalty })); };

  const shown = useShownSolves(solves);
  const lastSolve = lastSolveId === null ? null : shown.find(solve => solve.id === lastSolveId) ?? null;
  const { busy } = usePracticeLock(timer, saving);
  const nextScramble = () => { if (!busy && !generating) { timer.reset(); void generateNext(); } };
  const copyScramble = () => void Clipboard.setStringAsync(scramble).then(() => showNotice(tr("Scramble copied"), Copy)).catch(() => {});

  // The scramble played on its 3D puzzle, beside it.
  // Long scrambles get smaller moves, Megaminx ones (R++ D--) the smallest; a tablet reads them from further away.
  const promptFont = Math.round((/\+\+|--/.test(scramble) ? 13 : scramble.length > 90 ? 16 : 20) * (tablet ? (wide ? 1.15 : 1.5) : 1));
  // The digits grow with a tablet's room (the mockup's 190 px in portrait, 150 px sideways).
  const digitsMax = tablet ? (wide ? 150 : 190) : undefined;
  const loading = generating && (slow || !scramble) || !scramble && !generationError;
  const scrambleTarget = useTourTarget("scramble"), timerTarget = useTourTarget("timer"), sessionTarget = useTourTarget("session");

  // The scramble's settings as pills in the scramble's card on a tablet; a phone keeps them in the sheet behind its sliders button.
  const settings = <>
    {multi ? <Pill label={tr("Cubes")} value={String(cubes)} trailing={ChevronDown} onPress={() => openSheet("timer")} />
      : <Pill label={tr("Scramble")} value={tr(scrambleLabel(context.scrambleType))} trailing={ChevronDown} onPress={() => openSheet("timer")} />}
    {!fmc && <Pill label={tr("Entry")} value={said(TIME_ENTRIES.find(e => e.id === entry)?.label ?? entry)} trailing={ChevronDown} onPress={() => openSheet("timer")} />}
    {!blind && !typing && !attemptMode(context.solveMode) && <Pill label={tr("Inspection")} value={said(INSPECTIONS.find(i => i.id === inspection)?.label ?? inspection)} trailing={ChevronDown} onPress={() => openSheet("timer")} />}
  </>;
  const scrambleText = <View {...scrambleTarget} className="overflow-hidden" style={{ maxHeight: Math.round(height * 0.24) }}>
    {loading
      ? <View accessibilityLabel={tr("Generating a scramble")} className="gap-2"><Skeleton className="w-[92%]" style={{ height: promptFont * 1.2 }} /><Skeleton className="w-[58%]" style={{ height: promptFont * 1.2 }} /></View>
      : generationError ? <Alert variant="destructive" action={<Button size="sm" variant="outline" onPress={() => void generateNext()}><Text>{tr("Retry")}</Text></Button>}>{generationError}</Alert>
      // A Multi-Blind attempt's scrambles scroll: many cubes outgrow the card.
      : multi || relayOf(context.puzzle) ? <ScrollView nestedScrollEnabled><ScrambleLines text={scramble} size={Math.min(promptFont, 16)} puzzle={context.puzzle} /></ScrollView>
      : <Alg text={scramble} size={promptFont} />}
  </View>;
  const prompt = tablet ? <>{scrambleText}<View className="flex-row flex-wrap gap-2">{settings}</View></> : scrambleText;
  // The scramble's buttons beside it.
  const visual = <View className="flex-row">
    <IconButton icon={Shuffle} label={tr("Next scramble")} disabled={busy || slow || !!timer.saveError} onPress={nextScramble} />
    <IconButton icon={Copy} label={tr("Copy the scramble")} disabled={!scramble || loading} onPress={copyScramble} />
  </View>;

  // Fewest Moves and Multi-Blind show their own figures (a mean of 3, the best result).
  const ids = shownFigures(context.solveMode, figureIds);
  const figures = useMemo(() => sessionFigures(shown, ids, context.solveMode).map((f, i) => [...f, ids[i]!] as const), [shown, ids, context.solveMode]);
  const inspecting = timer.inspectedAt !== undefined && timer.phase !== "running";
  const hint = blind && timer.phase === "running"
    ? timer.memo === undefined ? tr("Tap when memorised") : tr("Memo {0} · {1}", { 0: fmtTime(timer.memo), 1: tr("Tap to stop") })
    : blind && timer.phase === "stopped" && timer.memo !== undefined
    ? tr("Memo {0} · execution {1}", { 0: fmtTime(timer.memo), 1: fmtTime(timer.elapsed - timer.memo) })
    : smart.hint ?? (phases > 1 && timer.phase === "running"
    ? phaseNames(phaseSetting, phases)[timer.splits?.length ?? 0]!
    : timerHint(timer, { unsaved: entry === "casual", disabled: !scramble || generating ? tr("One moment…") : false }));
  const event = tr(eventOf(context.puzzle, context.solveMode)?.label ?? info.label);
  const editFigures = <Pressable accessibilityRole="button" accessibilityLabel={tr("Choose the figures")} hitSlop={8} onPress={() => setEditingFigures(true)} className="size-8 items-center justify-center rounded-full active:bg-muted">
    <Icon as={Pencil} size={16} className="text-muted-foreground" />
  </Pressable>;
  // A row of up to six on a tablet's card; three to a row in the docked panel.
  const figureGrid = (columns: number) => <View className="min-w-0 flex-1 flex-row flex-wrap gap-y-2">
    {figures.map(([label, value, , id]) => <Stat key={id} label={label} value={value} dot={dotOf(id)} className={WIDTH[columns]} />)}
  </View>;
  const columns = tablet && figures.length <= 6 ? figures.length : figures.length <= 4 ? figures.length : figures.length === 6 ? 3 : 4;

  return <View className="flex-1">
    <View className="min-h-0 flex-1 flex-row">
      <View className="min-w-0 flex-1">
        <Fade hidden={running}>
          <AppBar title={tr("Timer")} scramble>
            {/* A phone's bar has room for one: the sheet of the settings (puzzle, scramble, entry, inspection); its calendar is in the times' sheet. */}
            {tablet ? <HeadButton icon={CalendarDays} label={tr("Sessions calendar")} onPress={() => wide ? setPanelCalendar(true) : setTimes("calendar")} />
              : <HeadButton icon={SlidersHorizontal} label={tr("Puzzle and scramble")} onPress={() => openSheet("timer")} />}
            {/* The WCA inspection on the timer itself, on or off (spoken and on screen); its other ways in the sheet. */}
            {!tablet && !blind && !typing && !attemptMode(context.solveMode) && <HeadButton icon={Hourglass} label={tr("WCA inspection")} active={inspection !== "off"} onPress={() => setInspection(inspection === "off" ? lastInspection.current : "off")} />}
            <HeadButton icon={Bluetooth} label={tr("Devices")} onPress={() => openDevices(true)} />
          </AppBar>
          <SectionTabs />
        </Fade>
        <View className={cn("min-h-0 flex-1 px-4 pt-2 pb-3", tablet && "px-7 pt-4")}>
          <Stage timer={timer} disabled={typing || fmc || !!mbld || !!timer.saveError} running={running} prompt={prompt} visual={visual}
            promptClassName={tablet ? "gap-5 rounded-3xl bg-card px-5 py-4" : undefined}
            readout={area => <View {...timerTarget} className="w-full items-center">
              {fmc
                ? <FewestMovesAttempt scramble={scramble} area={area} disabled={saving || generating || !scramble || !!generationError}
                  onDone={(ms, r) => {
                    if (r.dnf) toast({ title: `${tr("DNF")} · ${said(r.why)}` });
                    onStop(ms, r.dnf ? "dnf" : "none", undefined, { ...(r.solution ? { solution: r.solution } : {}), ...(r.moves !== null ? { moves: r.moves } : {}) }).catch(error => toast({ title: (error as Error).message }));
                  }} />
                : typing
                ? <TypedTime size={digitsSize(area, 6, digitsMax)} disabled={saving || generating || !scramble || !!generationError || !!typedError} error={typedError?.message}
                  onRetry={() => typedError && submitTyped(typedError.ms, typedError.penalty)} onSubmit={submitTyped} />
                : <>
                  {inspecting ? <InspectionDigits timer={timer} area={area} max={digitsMax} show={inspection === "display" || inspection === "both"} speak={inspection === "voice" || inspection === "both"} />
                    : <TimerDigits timer={timer} area={area} max={digitsMax} />}
                  <Hint notice={running ? null : notice} hidden={running && !blind && phases < 2}>{hint}</Hint>
                  {!running && lastSolve?.splits && <View className="mt-2 w-full max-w-md px-2"><PhaseSplits solve={lastSolve} height={10} /></View>}
                  <SaveError timer={timer} />
                </>}
            </View>}
            bar={<View className="gap-2.5">
              {/* The shared row of the last five sets its own top margin (mt-6), for a place under the digits; out of sight until a first time. */}
              {mbld ? <MultiBlindResult key={mbld.ms} ms={mbld.ms} cubes={mbld.cubes} disabled={saving} onSave={saveMultiBlind} onCancel={() => { setMbld(null); timer.reset(); }} />
                : !attemptMode(context.solveMode) && <View className={cn("-mt-6", tablet && "items-center")}><AverageWindow solves={shown} hidden={running || !shown.length} large={tablet} /></View>}
              {/* On a phone the last solve's actions show once there is one to act on (their place kept, so the digits never
                  move); a tablet keeps them, with the next scramble as the fifth action, under the thumb. */}
              <Fade hidden={!tablet && !lastSolve}>
                <LastSolveBar look="pills" solve={saving ? null : lastSolve}
                  extra={tablet ? <PillAction primary icon={Shuffle} label={tr("Next")} accessibilityLabel={tr("Next scramble")} disabled={busy || slow || !!timer.saveError} onPress={nextScramble} /> : undefined} />
              </Fade>
            </View>} />
          {/* A tall tablet has room for the session's times under the timer, its calendar in the sheet. */}
          {listed && <Fade hidden={running} className="pt-2.5">
            <View {...sessionTarget} className="overflow-hidden" style={{ height: Math.round(height * 0.28) }}>
              <TimesPanel solves={shown} title={event} context={context} calendar={false} onCalendar={open => { if (open) setTimes("calendar"); }}
                figures={<View className="mx-4 flex-row items-start rounded-2xl bg-card p-3">{figureGrid(columns)}{editFigures}</View>} />
            </View>
          </Fade>}
          {!wide && !listed && <Fade hidden={running} className="pt-2.5">
            <View {...sessionTarget}>
              {/* The figures alone; a tap opens the session: its name to edit, every figure, its times. */}
              <Pressable accessibilityRole="button" accessibilityLabel={tr("Session times")} onPress={() => setTimes("list")} className="rounded-2xl bg-card p-3 active:bg-card/80">
                <View className="flex-row">{figureGrid(columns)}</View>
              </Pressable>
            </View>
          </Fade>}
        </View>
      </View>
      {/* On a wide screen the session is docked at the right: its head, the chosen figures and its times, always shown. */}
      {wide && <Fade hidden={running} className="w-[360px] py-3 pr-4">
        <View {...sessionTarget} className="min-h-0 flex-1">
          <TimesPanel solves={shown} title={event} context={context} calendar={panelCalendar} onCalendar={setPanelCalendar}
            figures={<View className="mx-4 flex-row items-start rounded-2xl bg-card p-3">{figureGrid(3)}{editFigures}</View>} />
        </View>
      </Fade>}
    </View>
    <TimesSheet open={times !== null} calendar={times === "calendar"} onClose={() => setTimes(null)} solves={shown} title={event} context={context} onEditFigures={() => setEditingFigures(true)} />
    <FiguresSheet open={editingFigures} onClose={() => setEditingFigures(false)} />
    <ScrambleExportSheet open={exporting} onClose={() => setExporting(false)} context={context} />
    <StopSurface timer={timer} />
  </View>;
}

/** A quiet round icon button, 40 dp. */
function IconButton({ icon, label, onPress, disabled }: { icon: typeof Shuffle; label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    className={cn("size-10 items-center justify-center rounded-full active:bg-muted", disabled && "opacity-40")}>
    <Icon as={icon} size={18} className="text-muted-foreground" />
  </Pressable>;
}

/**
 * A WCA inspection: in the digits, when `show`, the seconds left from 15, then +2, then DNF (the penalty the start
 * would get); when `speak`, the judge's calls at 8 and 12 seconds (a voice where the device has one, a buzz always).
 */
function InspectionDigits({ timer, area, max, show, speak }: { timer: TimerApi; area: { width: number; height: number }; max?: number; show: boolean; speak: boolean }) {
  const since = timer.inspectedAt!;
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => { const interval = setInterval(() => setNow(performance.now()), 100); return () => clearInterval(interval); }, []);
  useEffect(() => {
    if (!speak) return;
    const voice = (globalThis as { speechSynthesis?: SpeechSynthesis }).speechSynthesis;
    const calls = [8, 12].flatMap(n => {
      const wait = since + n * 1000 - performance.now();
      return wait > 0 ? [setTimeout(() => {
        void Haptics.notificationAsync(n >= 12 ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (voice && typeof SpeechSynthesisUtterance !== "undefined") voice.speak(new SpeechSynthesisUtterance(tr("{0} seconds", { 0: n })));
      }, wait)] : [];
    });
    return () => { calls.forEach(clearTimeout); voice?.cancel(); };
  }, [since, speak]);
  const elapsed = now - since;
  const text = !show ? "0.00" : elapsed < INSPECTION_MS ? String(Math.ceil((INSPECTION_MS - elapsed) / 1000)) : elapsed < INSPECTION_DNF_MS ? "+2" : tr("DNF");
  return <Digits text={text} phase={timer.phase} size={digitsSize(area, 6, max)} />;
}

/** The figures most asked for, offered as they are; any average can still be one of the chosen. */
const OFFERED = ["best", "worst", "mean", "median", "count", "ao5", "ao12", "ao50", "ao100", "ao5:best", "ao12:best", "ao100:best"];

/** The figures of the session card: those chosen in order (a tap takes one off), then the others to add. */
function FiguresSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [ids, setIds] = useAtom(timerFiguresAtom);
  const [size, setSize] = useState("");
  const custom = Number(size), validSize = Number.isInteger(custom) && custom >= AVERAGE_SIZES.min && custom <= AVERAGE_SIZES.max;
  const add = (id: string) => setIds(ids.includes(id) || ids.length >= FIGURE_LIMIT ? ids : [...ids, id]);
  return <Sheet open={open} onClose={onClose} title={tr("Session figures")}>
    <Caption>{tr("Shown")}</Caption>
    <View className="flex-row flex-wrap gap-2">
      {ids.map(id => <Pill key={id} on label={said(figureLabel(id))} trailing={X} accessibilityLabel={tr("Remove {0}", { 0: said(figureLabel(id)) })} disabled={ids.length <= 1} onPress={() => setIds(ids.filter(f => f !== id))} />)}
    </View>
    <Caption>{tr("Add")}</Caption>
    <View className="flex-row flex-wrap gap-2">
      {OFFERED.filter(id => !ids.includes(id)).map(id => <Pill key={id} icon={Plus} label={said(figureLabel(id))} disabled={ids.length >= FIGURE_LIMIT} onPress={() => add(id)} />)}
    </View>
    <View className="flex-row items-center gap-2">
      <Text className="text-sm text-muted-foreground">{tr("Average of")}</Text>
      <SizeField value={size} onChange={setSize} />
      <Button size="sm" variant="secondary" className="h-10 rounded-full" disabled={!validSize || ids.length >= FIGURE_LIMIT} onPress={() => { add(averageFigure(custom, "current")); setSize(""); }}>
        <Text>{tr("Add")}</Text>
      </Button>
    </View>
    <Button variant="ghost" className="self-start" onPress={() => setIds(DEFAULT_FIGURES)}><Text>{tr("Reset")}</Text></Button>
  </Sheet>;
}

function SizeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <SheetInput value={value} onChangeText={text => onChange(text.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" placeholder="50" accessibilityLabel={tr("Average size")}
    className="h-10 w-20 text-center" />;
}
