import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Eye, EyeOff, Shuffle } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { fmtTime } from "../../../src/client/lib/format";
import { recordMessage, solveRecords } from "../../../src/client/lib/personalBest";
import { practiceSummary } from "../../../src/client/lib/practiceSummary";
import { CROSS_METHODS, CROSS_MOVES, CROSS_OPTIONS, CROSS_TARGET_LABELS, crossMask, hasSolutions, heldMoves, type CrossTarget } from "../../../src/shared/crossTraining";
import { contextKey, type PracticeContext } from "../../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { api } from "../api";
import { useLayout } from "../hooks/useLayout";
import { useTimer } from "../hooks/useTimer";
import { ensureLaunchSession } from "../lib/launchSession";
import { TimesSheet } from "./TimesSheet";
import { crossSolutions, type CrossSolution } from "../scrambler";
import { crossContextAtom, crossMovesAtom, crossScrambleAtom, crossTargetAtom, statsVersionAtom } from "../state";
import { DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { Alg, Fade, Label, MoreMenu } from "./layout";
import { PushedBar } from "./AppBar";
import {
  AverageWindow, CubePreview, Hint, SaveError, SessionPeek, Stage, StopSurface, TimerDigits, timerHint, useBackTo, useNotice, usePracticeLock,
  useScrambleGeneration, useSessionSolves, useShownSolves, useTimerChrome, type Metric,
} from "./Practice";
import { LastSolveBar, SolveAction } from "./SolveMenus";
import { tr } from "../../../src/client/i18n";

/**
 * Step training on the 3×3 (web `crossTraining`): timer solves on scrambles where a step is left to solve (the cross,
 * an EOLine, a block… in exactly the chosen number of moves, or a random state of a later step), recorded as timer
 * solves of the `xcross-6`, `zbll`… scramble types.
 */
export function CrossPractice({ onBack }: { onBack: () => void }) {
  const context = useAtomValue(crossContextAtom);
  // Each target and number of moves is its own context: its scramble, its session and its times.
  return <CrossSession key={contextKey(context)} context={context} onBack={onBack} />;
}

function CrossSession({ context, onBack }: { context: PracticeContext; onBack: () => void }) {
  const { height, tablet, wide } = useLayout();
  const [moves, setMoves] = useAtom(crossMovesAtom);
  const [target, setTarget] = useAtom(crossTargetAtom);
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
    if (!revealed || !scramble || solutions?.scramble === scramble || !hasSolutions(target)) return;
    let active = true;
    setSolutions({ scramble, list: null }); setSolutionError("");
    crossSolutions(scramble, target).then(list => { if (active) setSolutions({ scramble, list }); })
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
  // A tablet reads the scramble larger, its cube beside it at its size even on a short wide screen.
  const promptFont = (scramble.length > 90 ? 15 : 18) + (tablet ? 4 : 0);
  const previewSize = tablet ? 150 : height < 760 ? 0 : 84;
  const solutionFont = Math.max(15, promptFont - 3);
  const list = revealed && solutions?.scramble === scramble ? solutions.list : undefined;
  const summary = useMemo(() => practiceSummary(shown), [shown]);
  const peek: Metric[] = [["Ao5", fmtTime(summary.ao5), "accent"], ["Ao12", fmtTime(summary.ao12), "accent"], ["Best", fmtTime(summary.best), "good"]];

  const prompt = <>
    {generationError ? <Alert variant="destructive" action={<Button size="sm" variant="outline" onPress={() => void generateNext()}><Text>{tr("Retry")}</Text></Button>}>{generationError}</Alert>
      : generating && (slow || !scramble) ? <View accessibilityLabel={tr("Generating a scramble")} className="gap-2"><Skeleton className="w-[92%]" style={{ height: promptFont * 1.2 }} /><Skeleton className="w-[58%]" style={{ height: promptFont * 1.2 }} /></View>
      : <Alg text={scramble} size={promptFont} />}
    {revealed && hasSolutions(target) && <View className="gap-2">
      <Label>{tr("Solution · z2, white on the bottom")}</Label>
      {list ? <View className="gap-1.5">
        {list.map(v => <View key={v.moves + v.slot} className="flex-row items-center gap-4">
          <Alg text={heldMoves(v.moves)} size={solutionFont} className="flex-1" />
          {!!v.slot && <Text className="text-xs text-muted-foreground">{v.slot}</Text>}
        </View>)}
        {!list.length && <Text className="text-sm text-muted-foreground">{tr("No solution found.")}</Text>}
      </View> : solutionError ? <Alert variant="destructive" action={<Button size="sm" variant="outline" onPress={() => { setRevealed(false); setTimeout(() => setRevealed(true)); }}><Text>{tr("Retry")}</Text></Button>}>{solutionError}</Alert>
        : <Skeleton accessibilityLabel={tr("Searching the solutions")} style={{ height: solutionFont * 1.4, width: solutionFont * 9 }} />}
    </View>}
    {hasSolutions(target) && <View className="-ml-2.5 flex-row">
      <Button variant="ghost" size="sm" className="h-11 gap-1.5 rounded-lg" accessibilityLabel={revealed ? tr("Hide solution") : tr("Show solution")} disabled={busy || !scramble || generating} onPress={() => setRevealed(v => !v)}>
        <Icon as={revealed ? EyeOff : Eye} size={16} className="text-muted-foreground" />
        <Text className="text-sm text-muted-foreground">{tr("Solution")}</Text>
      </Button>
    </View>}
  </>;
  const visual = previewSize > 0 ? (scramble && !(generating && slow)
    ? <Pressable accessibilityRole="button" accessibilityLabel={tr("Replay the scramble on the cube")} onPress={() => setReplay(n => n + 1)}><CubePreview alg={scramble} size={previewSize} mask={crossMask(target)} view="iso" replay={replay} held /></Pressable>
    : <View style={{ width: previewSize, height: previewSize }} />) : null;

  return <View className="flex-1">
    <Fade hidden={running}>
      <PushedBar title={tr(CROSS_TARGET_LABELS[target])} sub={moves ? tr("{0} moves", { 0: moves }) : undefined} onBack={onBack}>
        <MoreMenu>
          {/* The web phone's MenuChoices: the steps method by method, then the number of moves, as radio items under their label. */}
          {CROSS_METHODS.map(method => <DropdownMenuGroup key={method}>
            <DropdownMenuLabel>{method}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={target} onValueChange={value => { if (!locked) setTarget(value as CrossTarget); }}>
              {CROSS_OPTIONS.filter(o => o.group === method).map(o => <DropdownMenuRadioItem key={o.id} value={o.id} disabled={locked} className="min-h-11"><Text className="text-base">{tr(o.label)}</Text></DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>)}
          {!!moves && <DropdownMenuGroup>
            <DropdownMenuLabel>{tr("Moves")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={String(moves)} onValueChange={value => { if (!locked) setMoves(Number(value)); }}>
              {CROSS_MOVES[target].map(n => <DropdownMenuRadioItem key={n} value={String(n)} disabled={locked} className="min-h-11"><Text className="text-base">{tr("{0} moves", { 0: n })}</Text></DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>}
        </MoreMenu>
      </PushedBar>
    </Fade>
    <View className="min-h-0 flex-1 px-4">
    <Stage timer={timer} disabled={!!timer.saveError} running={running} prompt={prompt} visual={visual}
      readout={area => <>
        <TimerDigits timer={timer} area={area} />
        <Hint notice={running ? null : notice} hidden={running}>{timerHint(timer, { disabled: !scramble || generating ? tr("One moment…") : false })}</Hint>
        <SaveError timer={timer} />
        <AverageWindow solves={shown} hidden={running} />
      </>}
      bar={<View className={cn(wide && "w-full max-w-[720px] self-center")}><LastSolveBar solve={saving ? null : lastSolve}
        extra={<SolveAction icon={Shuffle} label={tr("Scramble")} disabled={busy || slow || !!timer.saveError} onPress={nextScramble} />} /></View>} />
    <SessionPeek figures={peek} count={shown.length} noun="solve" onPress={() => setShowTimes(true)} hidden={running} />
    </View>
    <TimesSheet open={showTimes} onClose={() => setShowTimes(false)} solves={shown} title={tr("Times")} />
    <StopSurface timer={timer} />
  </View>;
}
