import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { BookOpen, Box, Check, LayoutGrid, Play, Swords, type LucideIcon } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { isLearningTrack, learningCases, reviewCases, trainingModeOptions, type LearningMode } from "../../../src/client/lib/dailyLearning";
import { CROSS_PLUS_ONE_MOVES } from "../../../src/shared/crossPlusOne";
import { plural } from "../../../src/client/lib/format";
import { eventInfo } from "../../../src/shared/puzzles";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import type { useDailyLearning } from "../hooks/useDailyLearning";
import { useDuel } from "../lib/duel";
import { casesAtom, crossMovesAtom, eventAtom, learnedCaseIdsAtom, puzzleAtom, routeAtom, selectedCaseIdsAtom, setsAtom } from "../state";
import { CaseSelector } from "./CaseSelector";
import { BackButton, Bar, Figure, ListGroup, ListRow, Numeric, Page, PageHead, SearchField } from "./layout";
import { SessionButton } from "./PuzzlePicker";
import { useBackTo } from "./Practice";
import { useTourTarget } from "../tour";

export type DailyLearning = ReturnType<typeof useDailyLearning>;
/** A way to practise: `cross1`, or a learning mode (`practice`, `review`, a track). */
export type SetupMode = { id: string; label: string; detail: string; icon: LucideIcon; progress?: number };

/** The ways to practise the current puzzle, with what each would train right now. */
export function useSetupModes(): SetupMode[] {
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom);
  const moves = useAtomValue(crossMovesAtom);
  const selected = useAtomValue(selectedCaseIdsAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  return useMemo<SetupMode[]>(() => [
    ...trainingModeOptions(puzzle).map(({ value, label }) => {
      const pool = isLearningTrack(value) ? learningCases(cases, value) : [];
      const done = pool.filter(c => learned.has(c.id)).length;
      return {
        id: value as string, label,
        icon: value === "practice" ? LayoutGrid : value === "review" ? Check : BookOpen,
        detail: value === "practice" ? selected.length ? `${plural(selected.length, "case")} selected` : "Pick the cases to drill"
          : value === "review" ? `Every learned case at random · ${reviewCases(cases, learned, puzzle).length}`
          : `One new case a day · ${done} / ${pool.length} learned`,
        progress: isLearningTrack(value) && pool.length ? done / pool.length : undefined,
      };
    }),
    ...(puzzle === "333" ? [{ id: "cross1", label: "Cross + 1", detail: `First block in ${moves} moves`, icon: Box }] : []),
  ], [puzzle, moves, cases, selected.length, learned]);
}

/**
 * The Train tab's first page: every way to practise the puzzle, grouped, the one trained last marked; then the duel.
 * A row opens its setup (`onOpen`), the duel its own page.
 */
export function TrainHome({ last, onOpen }: { last: string; onOpen: (mode: string) => void }) {
  const modes = useSetupModes();
  const setRoute = useSetAtom(routeAtom);
  const event = useAtomValue(eventAtom);
  const { duel } = useDuel();
  const target = useTourTarget("training");
  const row = (m: SetupMode, first: boolean) => <ListRow key={m.id} first={first} icon={m.icon} tone={m.id === last ? "primary" : "muted"} title={m.label}
    accessibilityLabel={`${m.label}, ${m.detail}`} onPress={() => onOpen(m.id)}
    detail={m.id === last ? `${m.detail} · last trained` : m.detail}>
    {m.progress !== undefined ? <Bar ratio={m.progress} className="mt-1.5 max-w-40" /> : null}
  </ListRow>;
  const drills = modes.filter(m => ["practice", "review", "cross1"].includes(m.id)), tracks = modes.filter(m => !drills.includes(m));
  const searching = duel.status === "searching", racing = duel.status === "racing";
  return <Page className="pb-0">
    <PageHead title="Train"><SessionButton /></PageHead>
    <ScrollView className="-mx-4 flex-1" contentContainerClassName="gap-6 px-4 pt-1 pb-6" showsVerticalScrollIndicator={false}>
      <View {...target} className="gap-6">
        <ListGroup title="Drills">{drills.map((m, i) => row(m, i === 0))}</ListGroup>
        {tracks.length ? <ListGroup title="Learn a set">{tracks.map((m, i) => row(m, i === 0))}</ListGroup> : null}
      </View>
      <ListGroup title="Compete">
        <ListRow first icon={Swords} tone={searching || racing ? "primary" : "muted"} title="Duel" onPress={() => setRoute({ page: "duel" })}
          detail={racing ? `Race in progress against ${duel.opponent.name}` : searching ? "Looking for an opponent…" : `Race an Ao5 of ${eventInfo(event)?.label ?? event} against a player near your level`} />
      </ListGroup>
    </ScrollView>
  </Page>;
}

/** A way to practise on its own page: what it trains, then the Start button at the bottom, under the thumb. */
export function SetupPage({ mode, onBack, onStart }: { mode: SetupMode; onBack: () => void; onStart: (mode: string) => void }) {
  useBackTo(onBack);
  return <Page className="pb-0">
    <PageHead lead={<BackButton label="Every way to practise" onPress={onBack} />} title={mode.label} />
    <View className="-mx-4 min-h-0 flex-1">
      {mode.id === "cross1" ? <CrossSetup onStart={() => onStart("cross1")} />
        : mode.id === "practice" ? <CasesSetup onStart={() => onStart("practice")} />
        : <LearningSetup mode={mode.id as LearningMode} onStart={() => onStart(mode.id)} />}
    </View>
  </Page>;
}

/** The foot of a setup: what the start will train, and the start. */
function SetupFoot({ onStart, disabled = false, children }: { onStart: () => void; disabled?: boolean; children: ReactNode }) {
  return <View className="gap-2 border-t border-border bg-background px-4 pt-3 pb-3">
    <Text numberOfLines={1} className="text-center text-[13px] text-muted-foreground">{children}</Text>
    <Button size="lg" className="h-12 gap-2 rounded-xl" disabled={disabled} onPress={onStart}>
      <Icon as={Play} size={16} className="text-primary-foreground" fill="currentColor" />
      <Text className="text-base font-semibold">Start</Text>
    </Button>
  </View>;
}

function CrossSetup({ onStart }: { onStart: () => void }) {
  const [moves, setMoves] = useAtom(crossMovesAtom);
  return <View className="flex-1">
    <ScrollView className="flex-1" contentContainerClassName="flex-grow justify-center gap-6 p-4">
      <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel="Moves">
        {CROSS_PLUS_ONE_MOVES.map(n => {
          const on = moves === n;
          return <Pressable key={n} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${n} moves`} onPress={() => setMoves(n)}
            className={cn("h-28 flex-1 items-center justify-center gap-1 rounded-2xl border active:opacity-70", on ? "border-primary bg-primary/10" : "border-border bg-card")}>
            <Numeric className={cn("text-4xl font-semibold", on && "text-primary")}>{n}</Numeric>
            <Text className="text-xs text-muted-foreground">moves</Text>
          </Pressable>;
        })}
      </View>
      <Text className="text-center text-sm leading-[20px] text-muted-foreground">Scrambles whose back block (a back F2L pair with its two cross edges) takes exactly this many moves, held white on the bottom, green in front (z2).</Text>
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
    <ScrollView className="flex-1" contentContainerClassName="flex-grow justify-center gap-8 p-6">
      <View className="flex-row justify-center gap-10">
        {figures.map(([label, value]) => <Figure key={label} label={label} value={String(value)} size="xl" className="items-center" />)}
      </View>
      {track ? <Bar ratio={pool.length ? learnedCount / pool.length : 0} className="h-1.5" /> : null}
      <Text className="text-center text-sm leading-[20px] text-muted-foreground">{review ? "Every case you marked as learned, drawn at random." : `One new ${track} case a day, group by group, until the set is learned.`}</Text>
    </ScrollView>
    <SetupFoot onStart={onStart} disabled={review && !pool.length}>{review ? pool.length ? plural(pool.length, "learned case") : "Mark cases as learned first" : `${learnedCount} of ${pool.length} learned`}</SetupFoot>
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
    <View className="flex-row items-center gap-2 px-4 pb-2">
      <SearchField value={query} onChangeText={setQuery} placeholder="Search cases…" className="flex-1" />
      <Button variant="ghost" className="h-11 rounded-xl" disabled={!selected.length} onPress={() => setSelected([])}><Text>Clear</Text></Button>
    </View>
    <CaseSelector cases={cases} sets={sets} selected={selected} onChange={setSelected} query={query} onOpenCase={caseId => setRoute({ page: "algorithms", caseId })} />
    <SetupFoot onStart={onStart} disabled={!selected.length}>{selected.length ? `${plural(selected.length, "case")} selected` : "Select the cases to practise"}</SetupFoot>
  </View>;
}
