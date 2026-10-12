import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Bluetooth, CalendarDays, ChevronDown, ChevronRight, Copy, ListOrdered, Pencil, Plus, Shuffle, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { fmtTime, INSPECTIONS, plural, shortDate, TIME_ENTRIES } from "../../../src/client/lib/format";
import { recordMessage, solveRecords } from "../../../src/client/lib/personalBest";
import { AVERAGE_SIZES, averageFigure, DEFAULT_FIGURES, figureLabel, FIGURE_LIMIT, practiceSummary, sessionFigures } from "../../../src/client/lib/practiceSummary";
import { INSPECTION_DNF_MS, INSPECTION_MS } from "../../../src/client/lib/practiceTimer";
import { contextKey, eventOf, puzzleInfo, scrambleLabel, type PracticeContext } from "../../../src/shared/puzzles";
import type { Penalty } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { useTimer, type TimerApi } from "../hooks/useTimer";
import { ensureLaunchSession } from "../lib/launchSession";
import { guidesAtom, playgroundScrambleAtom, practiceContextAtom, timeEntryAtom } from "../state";
import { Alg, Fade, HeadButton } from "../components/layout";
import {
  AverageWindow, Digits, digitsSize, Hint, SaveError, Stage, StopSurface, TimerDigits, TypedTime, timerHint,
  useNotice, usePracticeLock, useScrambleGeneration, useSessionSolves, useShownSolves, useTimerChrome,
} from "../components/Practice";
import { AppBar, SectionTabs } from "../components/AppBar";
import { Caption, inspectionAtom, Pill, sessionSheetAtom, timerFiguresAtom } from "../components/PuzzlePicker";
import { rememberTimerSession, resumeTimerSession, Stat, TimesPanel, TimesSheet, useTimerSessions } from "../components/TimesSheet";
import { LastSolveBar, PillAction } from "../components/SolveMenus";
import { Sheet, SheetInput } from "../components/Sheet";
import { useLayout } from "../hooks/useLayout";
import { useTourTarget } from "../tour";
import { said, tr } from "../../../src/client/i18n";

/** The timer: a new puzzle, mode or scramble type starts a fresh attempt and session (or the one it showed last). */
export function PlaygroundPage() {
  const context = useAtomValue(practiceContextAtom);
  resumeTimerSession(context);
  return <TimerSession key={contextKey(context)} context={context} />;
}

/** Figures of the session card, as many to a row as fit: up to four, six in two rows of three (up to six on a tablet). */
const WIDTH: Record<number, string> = { 1: "w-full", 2: "w-1/2", 3: "w-1/3", 4: "w-1/4", 5: "w-1/5", 6: "w-1/6" };
/** The colour dot of a figure of the session card. */
const dotOf = (id: string) => id === "best" || id.endsWith(":best") ? "bg-success" : id === "worst" || id.endsWith(":worst") ? "bg-destructive"
  : id === "ao5" ? "bg-primary" : id === "ao12" ? "bg-chart-2" : id === "mean" ? "bg-warning" : /^ao\d+$/.test(id) ? "bg-primary" : "bg-muted-foreground";

function TimerSession({ context }: { context: PracticeContext }) {
  const { height, tablet, wide } = useLayout();
  const info = puzzleInfo(context.puzzle);
  const entry = useAtomValue(timeEntryAtom);
  const inspection = useAtomValue(inspectionAtom);
  const figureIds = useAtomValue(timerFiguresAtom);
  const openSheet = useSetAtom(sessionSheetAtom), openGuide = useSetAtom(guidesAtom);
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
  const blind = context.solveMode === "blindfolded", typing = entry === "typing";
  const inspected = !blind && !typing && inspection !== "off";

  const onStop = useCallback(async (ms: number, penalty?: Penalty, memo?: number) => {
    // Casual timing records nothing: the time stays on screen and the next scramble comes up.
    if (entry === "casual") { setLastSolveId(null); void generateNext(); return; }
    setSaving(true);
    try {
      const sessionId = await ensureLaunchSession("playground", context);
      rememberTimerSession(context, sessionId);
      const solve = await api.addSolve({ sessionId, caseId: null, timeMs: ms, scramble, ...context, ...(penalty && penalty !== "none" ? { penalty } : {}), ...(memo !== undefined ? { memoMs: memo } : {}) });
      setSolves(s => [...s.filter(item => item.id !== solve.id), solve]);
      setLastSolveId(solve.id);
      // Records span every session, unlike the listed one.
      const message = recordMessage(solveRecords((await api.solves("playground", Infinity, context.puzzle, context)).reverse(), solve.id));
      if (message) showNotice(message);
      void generateNext();
    } finally { setSaving(false); }
  }, [scramble, context, generateNext, entry, showNotice]);
  const timer = useTimer({ onStop, canStart: !saving && !generating && !!scramble && !generationError, inspection: inspected, memo: blind });
  useTimerChrome(timer);
  // A typed time is saved like a timed one; a failed save keeps the time for a retry.
  const [typedError, setTypedError] = useState<{ message: string; ms: number } | null>(null);
  const submitTyped = (ms: number) => { setTypedError(null); onStop(ms).catch(error => setTypedError({ message: (error as Error).message, ms })); };

  const shown = useShownSolves(solves);
  const lastSolve = lastSolveId === null ? null : shown.find(solve => solve.id === lastSolveId) ?? null;
  const { busy, running } = usePracticeLock(timer, saving);
  const nextScramble = () => { if (!busy && !generating) { timer.reset(); void generateNext(); } };
  const copyScramble = () => void Clipboard.setStringAsync(scramble).then(() => showNotice(tr("Scramble copied"), Copy)).catch(() => {});

  // The scramble played on its 3D puzzle, beside it.
  // Long scrambles get smaller moves, Megaminx ones (R++ D--) the smallest; a tablet reads them from further away.
  const promptFont = Math.round((/\+\+|--/.test(scramble) ? 13 : scramble.length > 90 ? 16 : 20) * (tablet ? (wide ? 1.15 : 1.5) : 1));
  // The digits grow with a tablet's room (the mockup's 190 px in portrait, 150 px sideways).
  const digitsMax = tablet ? (wide ? 150 : 190) : undefined;
  const loading = generating && (slow || !scramble) || !scramble && !generationError;
  const scrambleTarget = useTourTarget("scramble"), timerTarget = useTourTarget("timer"), sessionTarget = useTourTarget("session");

  // The scramble's settings as pills: under the bar on a phone, in the scramble's card on a tablet.
  const settings = <>
    <Pill label={tr("Scramble")} value={tr(scrambleLabel(context.scrambleType))} trailing={ChevronDown} onPress={() => openSheet("timer")} />
    <Pill label={tr("Entry")} value={said(TIME_ENTRIES.find(e => e.id === entry)?.label ?? entry)} trailing={ChevronDown} onPress={() => openSheet("timer")} />
    {!blind && !typing && <Pill label={tr("Inspection")} value={said(INSPECTIONS.find(i => i.id === inspection)?.label ?? inspection)} trailing={ChevronDown} onPress={() => openSheet("timer")} />}
  </>;
  const scrambleText = <View {...scrambleTarget} className="overflow-hidden" style={{ maxHeight: Math.round(height * 0.24) }}>
    {loading
      ? <View accessibilityLabel={tr("Generating a scramble")} className="gap-2"><Skeleton className="w-[92%]" style={{ height: promptFont * 1.2 }} /><Skeleton className="w-[58%]" style={{ height: promptFont * 1.2 }} /></View>
      : generationError ? <Alert variant="destructive" action={<Button size="sm" variant="outline" onPress={() => void generateNext()}><Text>{tr("Retry")}</Text></Button>}>{generationError}</Alert>
      : <Alg text={scramble} size={promptFont} />}
  </View>;
  const prompt = tablet ? <>{scrambleText}<View className="flex-row flex-wrap gap-2">{settings}</View></> : scrambleText;
  const visual = <View className="items-center gap-1">
    <View className="flex-row">
      <IconButton icon={Shuffle} label={tr("Next scramble")} disabled={busy || slow || !!timer.saveError} onPress={nextScramble} />
      <IconButton icon={Copy} label={tr("Copy the scramble")} disabled={!scramble || loading} onPress={copyScramble} />
    </View>
  </View>;

  const summary = useMemo(() => practiceSummary(shown), [shown]);
  const figures = useMemo(() => sessionFigures(shown, figureIds).map((f, i) => [...f, figureIds[i]!] as const), [shown, figureIds]);
  const inspecting = timer.inspectedAt !== undefined && timer.phase !== "running";
  const hint = blind && timer.phase === "running"
    ? timer.memo === undefined ? tr("Tap when memorised") : tr("Memo {0} · {1}", { 0: fmtTime(timer.memo), 1: tr("Tap to stop") })
    : blind && timer.phase === "stopped" && timer.memo !== undefined
    ? tr("Memo {0} · execution {1}", { 0: fmtTime(timer.memo), 1: fmtTime(timer.elapsed - timer.memo) })
    : timerHint(timer, { unsaved: entry === "casual", disabled: !scramble || generating ? tr("One moment…") : false });
  const event = tr(eventOf(context.puzzle, context.solveMode)?.label ?? info.label);
  const sessions = useTimerSessions(context), session = sessions.list.find(x => x.id === sessions.current);
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
            <HeadButton icon={CalendarDays} label={tr("Sessions calendar")} onPress={() => wide ? setPanelCalendar(true) : setTimes("calendar")} />
            <HeadButton icon={Bluetooth} label={tr("Connect a cube")} onPress={() => openGuide("smartCube")} />
          </AppBar>
          <SectionTabs />
          {!tablet && <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0" contentContainerClassName="gap-2 px-4 pt-2.5 pb-1">{settings}</ScrollView>}
        </Fade>
        <View className={cn("min-h-0 flex-1 px-4 pt-2 pb-3", tablet && "px-7 pt-4")}>
          <Stage timer={timer} disabled={typing || !!timer.saveError} running={running} prompt={prompt} visual={visual}
            promptClassName={tablet ? "gap-5 rounded-3xl bg-card px-5 py-4" : undefined}
            readout={area => <View {...timerTarget} className="w-full items-center">
              {typing
                ? <TypedTime size={digitsSize(area, 6, digitsMax)} disabled={saving || generating || !scramble || !!generationError || !!typedError} error={typedError?.message}
                  onRetry={() => typedError && submitTyped(typedError.ms)} onSubmit={submitTyped} />
                : <>
                  {inspecting ? <InspectionDigits timer={timer} area={area} max={digitsMax} show={inspection === "display" || inspection === "both"} speak={inspection === "voice" || inspection === "both"} />
                    : <TimerDigits timer={timer} area={area} max={digitsMax} />}
                  <Hint notice={running ? null : notice} hidden={running && !blind}>{hint}</Hint>
                  <SaveError timer={timer} />
                </>}
            </View>}
            bar={<View className="gap-2.5">
              {/* The shared row of the last five sets its own top margin (mt-6), for a place under the digits. */}
              <View className={cn("-mt-6", tablet && "items-center")}><AverageWindow solves={shown} hidden={running} large={tablet} /></View>
              {/* A tablet has room for the next scramble in the row, under the thumb, as the fifth action. */}
              <LastSolveBar look="pills" solve={saving ? null : lastSolve}
                extra={tablet ? <PillAction primary icon={Shuffle} label={tr("Next")} accessibilityLabel={tr("Next scramble")} disabled={busy || slow || !!timer.saveError} onPress={nextScramble} /> : undefined} />
            </View>} />
          {!wide && <Fade hidden={running} className="pt-2.5">
            <View {...sessionTarget}>
              <Pressable accessibilityRole="button" accessibilityLabel={tr("Session times")} onPress={() => setTimes("list")} className="gap-2 rounded-2xl bg-card p-3 active:bg-card/80">
                <View className="flex-row items-center gap-2">
                  <Icon as={ListOrdered} size={16} className="text-foreground" />
                  <Text numberOfLines={1} className="min-w-0 shrink text-[13px] font-bold">
                    {session?.name || shortDate(session?.at ?? new Date().toISOString())} · {plural(shown.length, "solve")}
                    {summary.ao5 != null ? <Text className="text-[13px] font-bold text-chart-2"> · {tr("Ao5")} {fmtTime(summary.ao5)}</Text> : null}
                  </Text>
                  <View className="flex-1" />
                  {editFigures}
                  <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
                </View>
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
    <TimesSheet open={times !== null} calendar={times === "calendar"} onClose={() => setTimes(null)} solves={shown} title={event} context={context} />
    <FiguresSheet open={editingFigures} onClose={() => setEditingFigures(false)} />
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
  const text = !show ? "0.000" : elapsed < INSPECTION_MS ? String(Math.ceil((INSPECTION_MS - elapsed) / 1000)) : elapsed < INSPECTION_DNF_MS ? "+2" : tr("DNF");
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
  return <Sheet open={open} onClose={onClose} title={tr("Session figures")} description={tr("Up to {0} figures on the session card", { 0: FIGURE_LIMIT })}>
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
