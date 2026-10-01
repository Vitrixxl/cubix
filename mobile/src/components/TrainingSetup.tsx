import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { BookOpen, Box, Check, ChevronRight, LayoutGrid, Play, type LucideIcon } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { isLearningTrack, isReviewMode, learningCases, learningTrackOf, reviewCases, trainingModeOptions, type LearningMode } from "../../../src/client/lib/dailyLearning";
import { CROSS_PLUS_ONE_MOVES } from "../../../src/shared/crossPlusOne";
import { plural } from "../../../src/client/lib/format";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { useDailyLearning } from "../hooks/useDailyLearning";
import { casesAtom, crossMovesAtom, learnedCaseIdsAtom, puzzleAtom, routeAtom, selectedCaseIdsAtom, setsAtom, trainingKindAtom, trainingSetupModeAtom } from "../state";
import { CaseSelector } from "./CaseSelector";
import { BackButton, Figure, Mono, Page, PageHead, SearchField, Surface } from "./layout";
import { SessionButton } from "./PuzzlePicker";
import { useBackTo } from "./Practice";

export type DailyLearning = ReturnType<typeof useDailyLearning>;
/** A setup mode: `cross1`, or a learning mode (`practice`, `review`, a track). */
type SetupMode = { id: string; label: string; detail: string; icon: LucideIcon };

/** The mode trained last (web `defaultSetupMode`), marked in the list. */
function lastMode(kind: string, puzzle: string, mode: LearningMode) {
  if (kind === "cross1" && puzzle === "333") return "cross1";
  return isReviewMode(mode) ? "review" : learningTrackOf(mode) ?? "practice";
}

/**
 * Training starts here, as a step flow (the web phone setup): first the ways to practise as large rows, the one trained
 * last marked; then the chosen one on its own page, back to the list in the head and its Start at the bottom, under
 * the thumb. `onStart` receives `cross1` or a learning mode.
 */
export function TrainingSetup({ daily, onStart }: { daily: DailyLearning; onStart: (mode: string) => void }) {
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom);
  const kind = useAtomValue(trainingKindAtom);
  const moves = useAtomValue(crossMovesAtom);
  const selected = useAtomValue(selectedCaseIdsAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [setupMode, setSetupMode] = useAtom(trainingSetupModeAtom);
  const modes = useMemo<SetupMode[]>(() => [
    ...(puzzle === "333" ? [{ id: "cross1", label: "Cross + 1", detail: `${moves}-move first block`, icon: Box }] : []),
    ...trainingModeOptions(puzzle).map(({ value, label }) => {
      const pool = isLearningTrack(value) ? learningCases(cases, value) : [];
      return {
        id: value as string, label,
        icon: value === "practice" ? LayoutGrid : value === "review" ? Check : BookOpen,
        detail: value === "practice" ? `${plural(selected.length, "case")} selected`
          : value === "review" ? plural(reviewCases(cases, learned, puzzle).length, "learned case")
          : `${pool.filter(c => learned.has(c.id)).length} / ${pool.length} learned`,
      };
    }),
  ], [puzzle, moves, cases, selected.length, learned]);
  const chosen = modes.find(m => m.id === setupMode);
  const last = lastMode(kind, puzzle, daily.mode);
  useBackTo(() => setSetupMode(""), !!chosen);
  if (!chosen) return <Page>
    <PageHead title="Training"><SessionButton /></PageHead>
    <Text className="-mt-1 text-sm text-muted-foreground">Pick a way to practise.</Text>
    <Surface>
      <ScrollView bounces={false}>
        {modes.map((m, i) => <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`${m.label}, ${m.detail}`} onPress={() => setSetupMode(m.id)}
          className={cn("min-h-16 flex-row items-center gap-3 px-4 active:bg-muted/50", i > 0 && "border-t border-border")}>
          <View className={cn("size-9 items-center justify-center rounded-lg", m.id === last ? "bg-primary/15" : "bg-muted")}>
            <Icon as={m.icon} size={18} className={m.id === last ? "text-primary" : "text-muted-foreground"} />
          </View>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-[15px] font-medium">{m.label}</Text>
            <Text numberOfLines={1} className="text-xs text-muted-foreground">{m.detail}{m.id === last ? " · last trained" : ""}</Text>
          </View>
          <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
        </Pressable>)}
      </ScrollView>
    </Surface>
  </Page>;
  return <Page>
    <PageHead lead={<BackButton label="Every way to practise" onPress={() => setSetupMode("")} />} title={chosen.label} sub={chosen.detail} />
    <Surface key={chosen.id} className="flex-1">
      {chosen.id === "cross1" ? <CrossSetup onStart={() => onStart("cross1")} />
        : chosen.id === "practice" ? <CasesSetup onStart={() => onStart("practice")} />
        : <LearningSetup mode={chosen.id as LearningMode} onStart={() => onStart(chosen.id)} />}
    </Surface>
  </Page>;
}

/** The foot of the setup surface: what the start will train, and the start. */
function SetupFoot({ onStart, disabled = false, children }: { onStart: () => void; disabled?: boolean; children: ReactNode }) {
  return <View className="flex-row items-center justify-between gap-4 border-t border-border bg-muted/30 px-4 py-3">
    <Text numberOfLines={1} className="min-w-0 shrink text-sm text-muted-foreground">{children}</Text>
    <Button size="lg" className="h-12 gap-2 rounded-lg px-6" disabled={disabled} onPress={onStart}>
      <Icon as={Play} size={16} className="text-primary-foreground" />
      <Text className="text-base">Start</Text>
    </Button>
  </View>;
}

function CrossSetup({ onStart }: { onStart: () => void }) {
  const [moves, setMoves] = useAtom(crossMovesAtom);
  return <View className="flex-1">
    <ScrollView className="flex-1" contentContainerClassName="gap-6 p-4">
      <Text className="text-sm leading-[20px] text-muted-foreground">Scrambles whose back block (a back F2L pair with its two cross edges) takes exactly the chosen number of moves, held with white on the bottom and green in front (z2).</Text>
      <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel="Moves">
        {CROSS_PLUS_ONE_MOVES.map(n => {
          const on = moves === n;
          return <Pressable key={n} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${n} moves`} onPress={() => setMoves(n)}
            className={cn("flex-1 gap-1 rounded-lg px-4 py-3", on ? "bg-primary/15" : "bg-muted/40 active:bg-muted")}>
            <Mono className={cn("text-3xl font-medium", on && "text-primary")}>{n}</Mono>
            <Text className="text-xs text-muted-foreground">moves</Text>
          </Pressable>;
        })}
      </View>
    </ScrollView>
    <SetupFoot onStart={onStart}>First block in {moves} moves</SetupFoot>
  </View>;
}

function LearningSetup({ mode, onStart }: { mode: LearningMode; onStart: () => void }) {
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const review = mode === "review";
  const track = isLearningTrack(mode) ? mode : undefined;
  const pool = track ? learningCases(cases, track) : reviewCases(cases, learned, puzzle);
  const learnedCount = pool.filter(c => learned.has(c.id)).length;
  const figures: [string, number][] = review ? [["Learned cases", pool.length]] : [["Cases", pool.length], ["Learned", learnedCount], ["Left", pool.length - learnedCount]];
  return <View className="flex-1">
    <ScrollView className="flex-1" contentContainerClassName="gap-6 p-4">
      <Text className="text-sm leading-[20px] text-muted-foreground">{review ? "Every case you marked as learned, drawn at random." : `One new ${track} case a day, group by group, until the set is learned.`}</Text>
      <View className="flex-row gap-10">
        {figures.map(([label, value]) => <Figure key={label} label={label} value={String(value)} size="lg" />)}
      </View>
    </ScrollView>
    <SetupFoot onStart={onStart} disabled={review && !pool.length}>{review ? plural(pool.length, "learned case") : `${learnedCount} of ${pool.length} learned`}</SetupFoot>
  </View>;
}

/** Free practice: the case catalogue, set by set, with the search on top and the Start at the bottom. */
function CasesSetup({ onStart }: { onStart: () => void }) {
  const cases = useAtomValue(casesAtom);
  const sets = useAtomValue(setsAtom);
  const [selected, setSelected] = useAtom(selectedCaseIdsAtom);
  const setRoute = useSetAtom(routeAtom);
  const [query, setQuery] = useState("");
  return <View className="flex-1">
    <View className="flex-row items-center gap-2 p-3">
      <SearchField value={query} onChangeText={setQuery} placeholder="Search cases…" className="flex-1" />
      <Button variant="ghost" className="h-11" disabled={!selected.length} onPress={() => setSelected([])}><Text>Clear</Text></Button>
    </View>
    <CaseSelector cases={cases} sets={sets} selected={selected} onChange={setSelected} query={query} onOpenCase={caseId => setRoute({ page: "algorithms", caseId })} />
    <SetupFoot onStart={onStart} disabled={!selected.length}>{selected.length ? `${plural(selected.length, "case")} selected` : "Select the cases to practise"}</SetupFoot>
  </View>;
}
