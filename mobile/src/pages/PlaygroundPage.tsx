import { useAtom, useAtomValue } from "jotai";
import { Shuffle } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { practiceSummary } from "../../../src/client/lib/practiceSummary";
import { recordMessage, solveRecords } from "../../../src/client/lib/personalBest";
import { fmtTime } from "../../../src/client/lib/format";
import { contextKey, heldScramble, puzzleInfo, type PracticeContext } from "../../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { api } from "../api";
import { useTimer } from "../hooks/useTimer";
import { ensureLaunchSession } from "../lib/launchSession";
import { playgroundScrambleAtom, practiceContextAtom, timeEntryAtom } from "../state";
import { Alg, Fade, HeadButton, Page } from "../components/layout";
import {
  AverageWindow, Hint, SaveError, SessionPeek, Stage, StopSurface, TimerDigits, TypedTime, digitsSize, timerHint,
  useNotice, usePracticeLock, useScrambleGeneration, useSessionSolves, useShownSolves, useTimerChrome, type Metric,
} from "../components/Practice";
import { SessionButton } from "../components/PuzzlePicker";
import { TimesSheet } from "../components/TimesSheet";
import { LastSolveBar } from "../components/SolveMenus";
import { ScrambleCube } from "../components/ScrambleCube";
import { useLayout } from "../hooks/useLayout";
import { useTourTarget } from "../tour";

/** The timer: a new puzzle, mode or scramble type starts a fresh attempt and session. */
export function PlaygroundPage() {
  const context = useAtomValue(practiceContextAtom);
  return <TimerSession key={contextKey(context)} context={context} />;
}

function TimerSession({ context }: { context: PracticeContext }) {
  const { height } = useLayout();
  const info = puzzleInfo(context.puzzle);
  const entry = useAtomValue(timeEntryAtom);
  const [saving, setSaving] = useState(false);
  const [scramble, setScramble] = useAtom(playgroundScrambleAtom);
  const [solves, setSolves] = useSessionSolves("playground", context);
  const [showTimes, setShowTimes] = useState(false);
  // The time just recorded keeps its actions in the bar until the next attempt or its deletion.
  const [lastSolveId, setLastSolveId] = useState<number | null>(null);
  const [notice, showNotice] = useNotice();
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
      if (message) showNotice(message);
      void generateNext();
    } finally { setSaving(false); }
  }, [scramble, context, generateNext, entry, showNotice]);
  const timer = useTimer({ onStop, canStart: !saving && !generating && !!scramble && !generationError });
  useTimerChrome(timer);
  // A typed time is saved like a timed one; a failed save keeps the time for a retry.
  const [typedError, setTypedError] = useState<{ message: string; ms: number } | null>(null);
  const submitTyped = (ms: number) => { setTypedError(null); onStop(ms).catch(error => setTypedError({ message: (error as Error).message, ms })); };
  const typing = entry === "typing";

  const shown = useShownSolves(solves);
  const lastSolve = lastSolveId === null ? null : shown.find(solve => solve.id === lastSolveId) ?? null;
  const { busy, running } = usePracticeLock(timer, saving);
  const nextScramble = () => { if (!busy && !generating) { timer.reset(); void generateNext(); } };

  // The scramble played on its 3D puzzle.
  const held = heldScramble(context.scrambleType);
  const previewSize = height < 640 ? 0 : height < 760 ? 84 : 104;
  // Long scrambles (6×6, 7×7, Megaminx) get smaller moves so they fit the prompt without scrolling.
  const promptFont = scramble.length > 300 ? 12.5 : scramble.length > 160 ? 14 : scramble.length > 90 ? 16 : 19;

  const summary = practiceSummary(shown);
  const peek: Metric[] = [["Ao5", fmtTime(summary.ao5), "accent"], ["Ao12", fmtTime(summary.ao12), "accent"], ["Best", fmtTime(summary.best), "good"]];
  const loading = generating && (slow || !scramble) || !scramble && !generationError;
  // What the guided tour points at on this page.
  const scrambleTarget = useTourTarget("scramble"), timerTarget = useTourTarget("timer"), sessionTarget = useTourTarget("session");

  const prompt = <View {...scrambleTarget} style={{ maxHeight: Math.round(height * 0.3) }}>
    {loading
      ? <View accessibilityLabel="Generating a scramble" className="gap-2"><Skeleton className="w-[92%]" style={{ height: promptFont * 1.2 }} /><Skeleton className="w-[58%]" style={{ height: promptFont * 1.2 }} /></View>
      : generationError ? <View className="items-start gap-2"><Text className="text-sm text-destructive">{generationError}</Text><Button size="sm" variant="outline" onPress={() => void generateNext()}><Text>Retry</Text></Button></View>
      : <Alg text={scramble} size={promptFont} />}
  </View>;
  const visual = previewSize > 0 && scramble && !loading ? <ScrambleCube puzzle={context.puzzle} cubeSize={info.cubeSize} scramble={scramble} held={held} size={previewSize} still={busy} /> : null;

  return <Page className="pb-0">
    <Fade hidden={running} className="min-h-12 flex-row items-center justify-between gap-2">
      <SessionButton scramble />
      <HeadButton icon={Shuffle} label="New scramble" disabled={busy || slow || !!timer.saveError} onPress={nextScramble} />
    </Fade>
    <Stage timer={timer} disabled={typing || !!timer.saveError} running={running} prompt={prompt} visual={visual}
      readout={area => <View {...timerTarget} className="w-full items-center">
        {typing
          ? <TypedTime size={digitsSize(area, 6)} disabled={saving || generating || !scramble || !!generationError || !!typedError} error={typedError?.message}
            onRetry={() => typedError && submitTyped(typedError.ms)} onSubmit={submitTyped} />
          : <>
            <TimerDigits timer={timer} area={area} />
            <Hint notice={running ? null : notice} hidden={running}>{timerHint(timer, { unsaved: entry === "casual", disabled: !scramble || generating ? "One moment…" : false })}</Hint>
            <SaveError timer={timer} />
          </>}
        <AverageWindow solves={shown} hidden={running} />
      </View>}
      bar={<LastSolveBar solve={saving ? null : lastSolve} />} />
    <View {...sessionTarget}><SessionPeek figures={peek} count={shown.length} noun="solve" onPress={() => setShowTimes(true)} hidden={running} /></View>
    <TimesSheet open={showTimes} onClose={() => setShowTimes(false)} solves={shown} title="Times" />
    <StopSurface timer={timer} />
  </Page>;
}
