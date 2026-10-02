import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Box, Eye, EyeOff, Shuffle } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { fmtTime } from "../../../src/client/lib/format";
import { recordMessage, solveRecords } from "../../../src/client/lib/personalBest";
import { practiceSummary } from "../../../src/client/lib/practiceSummary";
import { CROSS_PLUS_ONE_MOVES, heldMoves } from "../../../src/shared/crossPlusOne";
import { contextKey, type PracticeContext } from "../../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { api } from "../api";
import { useLayout } from "../hooks/useLayout";
import { useTimer } from "../hooks/useTimer";
import { ensureLaunchSession } from "../lib/launchSession";
import { TimesSheet } from "./TimesSheet";
import { crossSolutions, type CrossSolution } from "../scrambler";
import { crossContextAtom, crossMovesAtom, crossScrambleAtom, statsVersionAtom } from "../state";
import { Alg, BackButton, Fade, HeadButton, Label, MenuItem, MoreMenu, Page, PageHead } from "./layout";
import {
  AverageWindow, CubePreview, Hint, SaveError, SessionPeek, Stage, StopSurface, TimerDigits, timerHint, useBackTo, useNotice, usePracticeLock,
  useScrambleGeneration, useSessionSolves, useShownSolves, useTimerChrome, type Metric,
} from "./Practice";
import { LastSolveBar } from "./SolveMenus";

/**
 * First-block training on the 3×3 (web `crossTraining`): timer solves on scrambles whose white cross and one back pair
 * take exactly 3, 4 or 5 moves, recorded as timer solves of the `cross1-N` scramble type.
 */
export function CrossPractice({ onBack }: { onBack: () => void }) {
  const context = useAtomValue(crossContextAtom);
  // Each number of moves is its own context: its scramble, its session and its times.
  return <CrossSession key={contextKey(context)} context={context} onBack={onBack} />;
}

function CrossSession({ context, onBack }: { context: PracticeContext; onBack: () => void }) {
  const { height } = useLayout();
  const [moves, setMoves] = useAtom(crossMovesAtom);
  const scramble = useAtomValue(crossScrambleAtom);
  const storeScramble = useSetAtom(crossScrambleAtom);
  const bumpStats = useSetAtom(statsVersionAtom);
  const [saving, setSaving] = useState(false);
  const [solves, setSolves] = useSessionSolves("playground", context);
  const shown = useShownSolves(solves);
  const [lastSolveId, setLastSolveId] = useState<number | null>(null);
  const [notice, showNotice] = useNotice();
  const [revealed, setRevealed] = useState(false);
  const [solutions, setSolutions] = useState<{ scramble: string; list: CrossSolution[] | null } | null>(null);
  const [solutionError, setSolutionError] = useState("");
  const [replay, setReplay] = useState(0);
  const [showTimes, setShowTimes] = useState(false);

  // The context travels with the scramble: a generation that ends after a change of moves keeps its own.
  const generation = useScrambleGeneration(context, next => storeScramble({ context, scramble: next }));
  const { generating, slow, error: generationError } = generation;
  const generateNext = useCallback(() => { setRevealed(false); return generation.generate(); }, [generation.generate]);
  useEffect(() => { if (!scramble) void generateNext(); }, []);

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
      if (message) showNotice(message);
      void generateNext();
    } finally { setSaving(false); }
  }, [scramble, context, generateNext, showNotice]);
  const timer = useTimer({ onStop, canStart: !saving && !generating && !!scramble && !generationError });
  useTimerChrome(timer);
  const { busy, running, locked } = usePracticeLock(timer, saving);
  useBackTo(onBack, !busy);
  const nextScramble = () => { if (!busy && !generating) { timer.reset(); void generateNext(); } };
  const lastSolve = lastSolveId === null ? null : shown.find(solve => solve.id === lastSolveId) ?? null;
  const promptFont = scramble.length > 90 ? 15 : 18;
  const previewSize = height < 760 ? 0 : 84;
  const solutionFont = Math.max(15, promptFont - 3);
  const list = revealed && solutions?.scramble === scramble ? solutions.list : undefined;
  const summary = practiceSummary(shown);
  const peek: Metric[] = [["Ao5", fmtTime(summary.ao5), "accent"], ["Ao12", fmtTime(summary.ao12), "accent"], ["Best", fmtTime(summary.best), "good"]];

  const prompt = <>
    {generationError ? <View className="items-start gap-2"><Text className="text-sm text-destructive">{generationError}</Text><Button size="sm" variant="outline" onPress={() => void generateNext()}><Text>Retry</Text></Button></View>
      : generating && (slow || !scramble) ? <View accessibilityLabel="Generating a scramble" className="gap-2"><Skeleton className="w-[92%]" style={{ height: promptFont * 1.2 }} /><Skeleton className="w-[58%]" style={{ height: promptFont * 1.2 }} /></View>
      : <Alg text={scramble} size={promptFont} />}
    {revealed && <View className="gap-2">
      <Label>Solution · z2, white on the bottom</Label>
      {list ? <View className="gap-1.5">
        {list.map(v => <View key={v.moves + v.slot} className="flex-row items-center gap-4">
          <Alg text={heldMoves(v.moves)} size={solutionFont} className="flex-1" />
          <Text className="text-xs text-muted-foreground">{v.slot} block</Text>
        </View>)}
        {!list.length && <Text className="text-sm text-muted-foreground">No solution within 6 moves.</Text>}
      </View> : solutionError ? <View className="flex-row items-center gap-2"><Text className="text-sm text-destructive">{solutionError}</Text>
        <Button size="sm" variant="outline" onPress={() => { setRevealed(false); setTimeout(() => setRevealed(true)); }}><Text>Retry</Text></Button></View>
        : <Skeleton accessibilityLabel="Searching the solutions" style={{ height: solutionFont * 1.4, width: solutionFont * 9 }} />}
    </View>}
    <View className="-ml-2.5 flex-row">
      <Button variant="ghost" size="sm" className="h-9 gap-1.5" disabled={busy || !scramble || generating} onPress={() => setRevealed(v => !v)}>
        <Icon as={revealed ? EyeOff : Eye} size={15} className="text-muted-foreground" />
        <Text className="text-[13px] text-muted-foreground">{revealed ? "Hide solution" : "Show solution"}</Text>
      </Button>
    </View>
  </>;
  const visual = previewSize > 0 ? (scramble && !(generating && slow)
    ? <Pressable accessibilityRole="button" accessibilityLabel="Replay the scramble on the cube" onPress={() => setReplay(n => n + 1)}><CubePreview alg={scramble} size={previewSize} view="iso" replay={replay} held /></Pressable>
    : <View style={{ width: previewSize, height: previewSize }} />) : null;

  return <Page className="pb-0">
    <Fade hidden={running}>
      <PageHead lead={<BackButton label="Change what to train" onPress={onBack} />} title="Cross + 1" sub={`${moves}-move first block`}>
        <HeadButton icon={Shuffle} label="New scramble" disabled={busy || slow || !!timer.saveError} onPress={nextScramble} />
        <MoreMenu>
          {CROSS_PLUS_ONE_MOVES.map(n => <MenuItem key={n} icon={Box} disabled={locked || n === moves} onPress={() => setMoves(n)}>{`${n}-move first block${n === moves ? " ✓" : ""}`}</MenuItem>)}
        </MoreMenu>
      </PageHead>
    </Fade>
    <Stage timer={timer} disabled={!!timer.saveError} running={running} prompt={prompt} visual={visual}
      readout={area => <>
        <TimerDigits timer={timer} area={area} />
        <Hint notice={running ? null : notice} hidden={running}>{timerHint(timer, { disabled: !scramble || generating ? "One moment…" : false })}</Hint>
        <SaveError timer={timer} />
        <AverageWindow solves={shown} hidden={running} />
      </>}
      bar={<LastSolveBar solve={saving ? null : lastSolve} />} />
    <SessionPeek figures={peek} count={shown.length} noun="solve" onPress={() => setShowTimes(true)} hidden={running} />
    <TimesSheet open={showTimes} onClose={() => setShowTimes(false)} solves={shown} title="Times" />
    <StopSurface timer={timer} />
  </Page>;
}
