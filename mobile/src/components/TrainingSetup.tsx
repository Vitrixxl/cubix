import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Box, Check, LayoutGrid, Play, type LucideIcon } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { isLearningTrack, puzzleStages, reviewCases, trainingModeOptions } from "../../../src/client/lib/dailyLearning";
import { CROSS_PLUS_ONE_MOVES } from "../../../src/shared/crossPlusOne";
import { plural } from "../../../src/client/lib/format";
import { toggleSelection } from "../../../src/client/lib/practiceCatalog";
import { puzzleOf } from "../../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { useDailyLearning } from "../hooks/useDailyLearning";
import { casesAtom, crossMovesAtom, learnedCaseIdsAtom, puzzleAtom, reviewStagesAtom, routeAtom, selectedCaseIdsAtom, setsAtom } from "../state";
import { CaseDiagram } from "./CaseDiagram";
import { CaseSelector } from "./CaseSelector";
import { BackButton, Numeric, Page, PageHead, SearchField, Surface } from "./layout";
import { PickerCard } from "./PickerCard";
import { SessionButton } from "./PuzzlePicker";
import { useBackTo } from "./Practice";
import { useTourTarget } from "../tour";
import { tr } from "../../../src/client/i18n";

export type DailyLearning = ReturnType<typeof useDailyLearning>;
/** A way to practise: `cross1`, `practice` or `review`; learning a set case by case belongs to Learn, not here. */
export type SetupMode = { id: string; label: string; summary: string; detail: string; icon: LucideIcon };

/** The ways to practise the current puzzle (web `setupModes`), with what each would train right now. */
export function useSetupModes(): SetupMode[] {
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom);
  const moves = useAtomValue(crossMovesAtom);
  const selected = useAtomValue(selectedCaseIdsAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  return useMemo<SetupMode[]>(() => [
    ...(puzzle === "333" ? [{ id: "cross1", label: tr("Cross + 1"), summary: tr("Scrambles whose first block takes an exact number of moves, to plan it in inspection."), detail: tr("{0}-move first block", { 0: moves }), icon: Box }] : []),
    ...trainingModeOptions(puzzle).filter(({ value }) => !isLearningTrack(value)).map(({ value, label }) => ({
      id: value as string, label,
      icon: value === "practice" ? LayoutGrid : Check,
      summary: value === "practice" ? tr("Pick the cases you want and drill them, one scramble after another.") : tr("Every case you marked as learned, drawn at random, so none slips away."),
      detail: value === "practice" ? tr("{0} selected", { 0: plural(selected.length, "case") }) : plural(reviewCases(cases, new Set(learnedIds), puzzle).length, "learned case"),
    })),
  ], [puzzle, moves, cases, selected.length, learnedIds]);
}

/** The Train tab's first page: every way to practise the puzzle as large cards, the one trained last marked. */
export function TrainHome({ last, onOpen }: { last: string; onOpen: (mode: string) => void }) {
  const modes = useSetupModes();
  const target = useTourTarget("training");
  return <Page className="pb-0">
    <PageHead title={tr("Training")} sub={tr("Pick a way to practise")}><SessionButton /></PageHead>
    <ScrollView className="-mx-4 flex-1" contentContainerClassName="px-4 pt-1 pb-6" showsVerticalScrollIndicator={false}>
      <View {...target} accessibilityLabel={tr("Training modes")} className="gap-3">
        {modes.map(m => <PickerCard key={m.id} icon={lit => <Icon as={m.icon} size={20} className={lit ? "text-primary" : "text-muted-foreground"} />}
          title={m.label} detail={m.summary} meta={m.detail} marked={m.id === last} badge={m.id === last ? tr("Last trained") : undefined}
          accessibilityLabel={`${tr(m.label)}, ${m.detail}`} onPress={() => onOpen(m.id)} />)}
      </View>
    </ScrollView>
  </Page>;
}

/** A way to practise on its own page: what it needs, then its Start. */
export function SetupPage({ mode, onBack, onStart }: { mode: SetupMode; onBack: () => void; onStart: (mode: string) => void }) {
  useBackTo(onBack);
  return <Page className="pb-0">
    <PageHead lead={<BackButton label={tr("Every way to practise")} onPress={onBack} />} title={mode.label} sub={mode.detail} />
    {mode.id === "cross1" ? <CrossSetup onStart={() => onStart("cross1")} />
      : mode.id === "practice" ? <Surface className="mb-3 flex-1"><CasesSetup onStart={() => onStart("practice")} /></Surface>
      : <ReviewSetup onStart={() => onStart("review")} />}
  </Page>;
}

/** The start of a mode, large. */
function Start({ onPress, disabled = false, children }: { onPress: () => void; disabled?: boolean; children: ReactNode }) {
  return <Button size="lg" className="h-11 gap-2 rounded-lg" disabled={disabled} onPress={onPress}>
    <Icon as={Play} size={16} className="text-primary-foreground" fill="currentColor" />
    <Text className="text-base font-semibold">{children}</Text>
  </Button>;
}

function CrossSetup({ onStart }: { onStart: () => void }) {
  const [moves, setMoves] = useAtom(crossMovesAtom);
  return <ScrollView className="-mx-4 flex-1" contentContainerClassName="flex-grow items-center justify-center gap-8 px-4 py-6">
    <Text className="text-center text-sm text-muted-foreground">{tr("Scrambles whose back block takes exactly the chosen number of moves.")}</Text>
    <View className="w-full flex-row gap-3" accessibilityRole="radiogroup" accessibilityLabel={tr("Moves")}>
      {CROSS_PLUS_ONE_MOVES.map(n => {
        const on = moves === n;
        return <Pressable key={n} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={tr("{0} moves", { 0: n })} onPress={() => setMoves(n)}
          className={cn("flex-1 items-center gap-1 rounded-2xl border px-4 py-5 active:opacity-70", on ? "border-primary/50 bg-primary/10" : "border-border bg-card")}>
          <Numeric className={cn("text-4xl font-medium", on && "text-primary")}>{n}</Numeric>
          <Text className="text-xs text-muted-foreground">{tr("moves")}</Text>
        </Pressable>;
      })}
    </View>
    <Start onPress={onStart}>{tr("Start · {0} moves", { 0: moves })}</Start>
  </ScrollView>;
}

/** The stages to review, as cards to pick together; the start shows under them once one holds learned cases. */
function ReviewSetup({ onStart }: { onStart: () => void }) {
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const [picked, setPicked] = useAtom(reviewStagesAtom);
  const stages = useMemo(() => {
    const learned = new Set(learnedIds);
    return puzzleStages(cases, puzzle).map(stage => {
      const members = cases.filter(c => puzzleOf(c) === puzzle && c.stage === stage);
      return { stage, cases: members, learned: members.filter(c => learned.has(c.id)), sets: [...new Set(members.map(c => c.setLabel))] };
    });
  }, [cases, puzzle, learnedIds]);
  const pool = stages.filter(st => picked.includes(st.stage)).reduce((n, st) => n + st.learned.length, 0);
  return <ScrollView className="-mx-4 flex-1" contentContainerClassName="gap-3 px-4 pt-1 pb-6" showsVerticalScrollIndicator={false}>
    <View accessibilityLabel={tr("Stages to review")} className="gap-3">
      {stages.map(st => <PickerCard key={st.stage} icon={() => <CaseDiagram c={st.learned[0] ?? st.cases[0]!} size={32} />}
        title={st.stage} detail={st.sets.join(", ")} meta={tr("{0} / {1} learned", { 0: st.learned.length, 1: st.cases.length })}
        pressed={picked.includes(st.stage) && st.learned.length > 0} disabled={!st.learned.length}
        onPress={() => setPicked([...toggleSelection(new Set(picked), [st.stage])])} />)}
    </View>
    {pool > 0 ? <View className="items-center pt-3"><Start onPress={onStart}>{tr("Start · {0}", { 0: plural(pool, "case") })}</Start></View> : null}
  </ScrollView>;
}

/** Free practice: the case catalogue, set by set, with the search on top and the Start at the bottom, under the thumb. */
function CasesSetup({ onStart }: { onStart: () => void }) {
  const cases = useAtomValue(casesAtom);
  const sets = useAtomValue(setsAtom);
  const [selected, setSelected] = useAtom(selectedCaseIdsAtom);
  const setRoute = useSetAtom(routeAtom);
  const [query, setQuery] = useState("");
  return <View className="flex-1">
    <View className="flex-row items-center gap-2 px-4 pt-4 pb-2">
      <SearchField value={query} onChangeText={setQuery} placeholder={tr("Search cases…")} className="flex-1" />
      <Button variant="outline" className="h-11 rounded-lg" disabled={!selected.length} onPress={() => setSelected([])}><Text>{tr("Clear")}</Text></Button>
    </View>
    <View className="min-h-0 flex-1 border-t border-border">
      <CaseSelector cases={cases} sets={sets} selected={selected} onChange={setSelected} query={query} onOpenCase={caseId => setRoute({ page: "algorithms", caseId })} />
    </View>
    <View className="flex-row items-center justify-between gap-4 border-t border-border bg-muted/30 px-2 py-2">
      <Text numberOfLines={1} className="min-w-0 shrink px-2 text-sm text-muted-foreground">{selected.length ? tr("{0} selected", { 0: plural(selected.length, "case") }) : tr("Select the cases to practise")}</Text>
      <Start onPress={onStart} disabled={!selected.length}>{tr("Start")}</Start>
    </View>
  </View>;
}
