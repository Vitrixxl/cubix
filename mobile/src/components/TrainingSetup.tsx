import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Check, ChevronRight, CircleHelp, Dices, Eye, GraduationCap, Layers, Play, Rotate3d, Search, Shuffle, Target, Timer, type LucideIcon } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { plural } from "../../../src/client/lib/format";
import { recommend, recommendedWhy, trainingPool, type Recommendation } from "../../../src/client/lib/trainingPicks";
import { CROSS_MOVES, CROSS_TARGET_LABELS, CROSS_TARGETS, type CrossTarget } from "../../../src/shared/crossTraining";
import { METHODS } from "../../../src/shared/methods";
import { puzzleInfo, type PuzzleId } from "../../../src/shared/puzzles";
import type { CaseDto, SetDto } from "../../../src/shared/types";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
  casesAtom, crossMovesAtom, crossTargetAtom, guidesAtom, learnedCaseIdsAtom, perPuzzleAtom, persisted, puzzleAtom, randomAufAtom, routeAtom,
  selectedCaseIdsAtom, setsAtom, statsAtom, type TrainingRun,
} from "../state";
import { AppBar, PushedBar, SectionTabs } from "./AppBar";
import { CaseDiagram } from "./CaseDiagram";
import { CaseSelector } from "./CaseSelector";
import { Chip, ChipMenu } from "./Chips";
import { Bar, Empty, HeadButton, Numeric, SearchField } from "./layout";
import { useBackTo } from "./Practice";
import { Sheet } from "./Sheet";
import { useTourTarget } from "../tour";
import { said, tr } from "../../../src/client/i18n";

/** Whole sets the training drills (their learned cases), per puzzle (shared with the web prefs' names). */
export const trainSetsAtom = perPuzzleAtom<string[]>("cubix.training.setsByCube", []);
/** The recommended cases picked, per puzzle; none stored: the four first recommended. */
export const trainPicksAtom = perPuzzleAtom<string[] | null>("cubix.training.picksByCube", null);
/** The cases free practice drills, learned or not, per puzzle. */
export const freePicksAtom = perPuzzleAtom<string[]>("cubix.training.freeByCube", []);
/** The set the recognition goes through, per puzzle, and the seconds each case is shown. */
const recognitionChoiceAtom = perPuzzleAtom<string>("cubix.training.recognitionByCube", "");
export const recognitionSecondsAtom = persisted<number>("cubix.training.recognitionSeconds", 3);
const RECOGNITION_SECONDS = [1, 2, 3, 5, 8];

/** The course that teaches a set, if one does. */
const courseOf = (puzzle: PuzzleId, setId: string) => METHODS[puzzle]?.find(m => m.steps.some(step => step.sets?.includes(setId)))?.id;

/**
 * What the training stands on: the sets with their learned cases (those with some first), the recommended cases (the
 * learned ones slower than usual in training), the pool the cases' training drills (the recommended picked, the whole
 * sets and the cases picked by hand, learned ones only) and its parts in words.
 */
export function useTrainingData() {
  const puzzle = useAtomValue(puzzleAtom);
  const cases = useAtomValue(casesAtom), sets = useAtomValue(setsAtom), stats = useAtomValue(statsAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const trainSets = useAtomValue(trainSetsAtom), storedPicks = useAtomValue(trainPicksAtom), hand = useAtomValue(selectedCaseIdsAtom);
  const choice = useAtomValue(recognitionChoiceAtom);
  // The smart cube's solves are not analysed on the phone: the recommendations come from the training alone.
  const recommended = useMemo(() => recommend(cases, learned, [...stats.values()], []), [cases, learned, stats]);
  const picks = useMemo(() => storedPicks ?? recommended.slice(0, 4).map(r => r.id), [storedPicks, recommended]);
  const setRows = useMemo(() => {
    const rows = sets.flatMap(set => {
      const all = cases.filter(c => c.set === set.id);
      return all.length ? [{ set, all, learned: all.filter(c => learned.has(c.id)).length }] : [];
    });
    return [...rows.filter(x => x.learned), ...rows.filter(x => !x.learned)];
  }, [sets, cases, learned]);
  const pool = useMemo(() => trainingPool(cases, learned, { picks, sets: trainSets, hand }), [cases, learned, picks, trainSets, hand]);
  const known = (ids: string[]) => ids.filter(id => learned.has(id)).length;
  const learnedPool = useMemo(() => trainingPool(cases, learned, { picks, hand }).length, [cases, learned, picks, hand]);
  const whole = useMemo(() => trainingPool(cases, learned, { sets: trainSets }).length, [cases, learned, trainSets]);
  const parts = [
    ...(known(picks) ? [tr("{0} recommended", { 0: known(picks) })] : []),
    ...setRows.flatMap(x => trainSets.includes(x.set.id) && x.learned ? [tr("{0} · {1} learned", { 0: tr(x.set.label), 1: x.learned })] : []),
    ...(known(hand) ? [tr("{0} by hand", { 0: known(hand) })] : []),
  ];
  const recognition = setRows.find(x => x.set.id === choice && x.learned) ?? setRows.find(x => x.learned);
  return { puzzle, cases, learned, recommended, picks, hand, trainSets, setRows, pool, learnedPool, whole, parts, recognition, totalLearned: setRows.reduce((n, x) => n + x.learned, 0) };
}
export type TrainingData = ReturnType<typeof useTrainingData>;

/** Opens the course that teaches a set (a set with nothing learned leads there). */
function useOpenCourse() {
  const puzzle = useAtomValue(puzzleAtom), setRoute = useSetAtom(routeAtom);
  return (setId: string) => setRoute({ page: "learn", method: courseOf(puzzle, setId) });
}

/** A way of training as a card: its icon, name and line, its number large with what it counts, then its settings. */
function ModeCard({ icon, title, summary, count, unit, lit = false, onPress, children, accessibilityLabel }: {
  icon: LucideIcon; title: string; summary: string; count?: number; unit?: string; lit?: boolean; onPress?: () => void; children?: ReactNode; accessibilityLabel?: string;
}) {
  const body = <>
    <View className="flex-row items-center gap-3">
      <View className={cn("size-10 items-center justify-center rounded-xl", lit ? "bg-card" : "bg-muted")}><Icon as={icon} size={20} className={lit ? "text-primary" : "text-muted-foreground"} /></View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-base font-extrabold tracking-tight">{title}</Text>
        <Text numberOfLines={1} className="text-[13px] text-muted-foreground">{summary}</Text>
      </View>
      {count !== undefined && <View className="items-end">
        <Numeric className={cn("text-2xl leading-7 font-extrabold tracking-tight", !count && "text-muted-foreground/50")}>{count}</Numeric>
        {unit ? <Text numberOfLines={1} className="max-w-24 text-xs text-muted-foreground">{unit}</Text> : null}
      </View>}
    </View>
    {children}
  </>;
  const className = cn("gap-2.5 rounded-2xl p-3", lit ? "border border-primary bg-primary/10" : "bg-card");
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={onPress} className={cn(className, "active:opacity-80")}>{body}</Pressable>
    : <View className={className}>{body}</View>;
}

/** A small pill of figures (4 recommended, 0 picked). */
function Pill({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <View className={cn("h-7 justify-center rounded-full px-2.5", accent ? "bg-primary/15" : "bg-muted")}>
    <Text className={cn("text-xs font-bold", accent ? "text-primary" : "text-muted-foreground")}>{children}</Text>
  </View>;
}

/** The start of a card's training, as a pill. */
const StartChip = ({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) =>
  <Chip icon={Play} onPress={onPress} disabled={disabled}>{tr("Start")}</Chip>;

/**
 * The Training tab: the five ways of training, each with its settings in chips under its name (the cross's goal and
 * moves, the recognition's set and seconds, the whole sets); Learned opens its own screen; the bottom bar counts the
 * cases the training drills, with Random AUF and Train.
 */
export function TrainHome({ onOpen, onStart }: { onOpen: (mode: string) => void; onStart: (run: TrainingRun) => void }) {
  const data = useTrainingData();
  const openGuide = useSetAtom(guidesAtom), openCourse = useOpenCourse();
  const [target, setTarget] = useAtom(crossTargetAtom), [moves, setMoves] = useAtom(crossMovesAtom);
  const [trainSets, setTrainSets] = useAtom(trainSetsAtom);
  const setRecognition = useSetAtom(recognitionChoiceAtom);
  const [seconds, setSeconds] = useAtom(recognitionSecondsAtom);
  const [auf, setAuf] = useAtom(randomAufAtom);
  const freePicks = useAtomValue(freePicksAtom);
  const [picking, setPicking] = useState(false);
  const cube = !!puzzleInfo(data.puzzle).cubeSize;
  const free = freePicks.filter(id => data.cases.some(c => c.id === id)).length;
  const chosen = data.recognition;
  const handPicked = data.hand.filter(id => data.learned.has(id)).length, recommendedPicked = data.picks.filter(id => data.learned.has(id)).length;
  const tour = useTourTarget("training");
  return <View className="flex-1">
    <AppBar><HeadButton icon={CircleHelp} label={tr("Help")} onPress={() => openGuide("training")} /></AppBar>
    <SectionTabs />
    <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-2 px-4 pt-3 pb-3" showsVerticalScrollIndicator={false}>
      <View {...tour} accessibilityLabel={tr("Ways of training")} className="gap-2">
        {data.puzzle === "333" && <ModeCard icon={Target} title={tr("Cross")} summary={tr("Plan the cross in inspection, by its exact number of moves")} count={moves} unit={tr("moves")}>
          <View className="flex-row items-center gap-1.5">
            <ChipMenu label={tr("What to build")} value={target} onChange={t => setTarget(t as CrossTarget)} options={CROSS_TARGETS.map(t => ({ id: t, label: tr(CROSS_TARGET_LABELS[t]) }))}>{tr(CROSS_TARGET_LABELS[target])}</ChipMenu>
            <ChipMenu label={tr("Moves")} value={String(moves)} onChange={n => setMoves(Number(n))} options={CROSS_MOVES[target].map(n => ({ id: String(n), label: tr("{0} moves", { 0: n }) }))}>{tr("{0} moves", { 0: moves })}</ChipMenu>
            <View className="flex-1" />
            <StartChip onPress={() => onStart("cross")} />
          </View>
        </ModeCard>}
        <ModeCard icon={Eye} title={tr("Recognition")} summary={tr("The learned cases of a set at random, until you stop")} count={chosen?.learned ?? 0} unit={chosen ? tr(chosen.set.label) : tr("cases")}>
          {chosen && <Bar ratio={chosen.learned / chosen.all.length} />}
          <View className="flex-row flex-wrap items-center gap-1.5">
            <ChipMenu label={tr("Set")} value={chosen?.set.id ?? ""} onChange={setRecognition} disabled={!chosen}
              options={data.setRows.filter(x => x.learned).map(x => ({ id: x.set.id, label: tr("{0} · {1} of {2}", { 0: tr(x.set.label), 1: x.learned, 2: x.all.length }) }))}
              extra={data.setRows.filter(x => !x.learned).map(x => <DropdownMenuItem key={x.set.id} className="min-h-11" onPress={() => openCourse(x.set.id)}>
                <Text className="text-base text-muted-foreground">{tr("{0} · none learned · see Courses", { 0: tr(x.set.label) })}</Text>
              </DropdownMenuItem>)}>
              {chosen ? tr("{0} · {1} of {2}", { 0: tr(chosen.set.label), 1: chosen.learned, 2: chosen.all.length }) : tr("Nothing learned yet")}
            </ChipMenu>
            <ChipMenu label={tr("Seconds per case")} icon={Timer} value={String(seconds)} onChange={n => setSeconds(Number(n))} options={RECOGNITION_SECONDS.map(n => ({ id: String(n), label: tr("{0} s", { 0: n }) }))}>{tr("{0} s", { 0: seconds })}</ChipMenu>
            {cube && <Chip icon={Shuffle} on={auf} onPress={() => setAuf(!auf)} accessibilityLabel={tr("Random AUF")}>{tr("AUF")}</Chip>}
            <View className="flex-1" />
            <StartChip onPress={() => onStart("recognition")} disabled={!chosen} />
          </View>
        </ModeCard>
        <ModeCard icon={GraduationCap} title={tr("Learned")} summary={tr("Your slowest learned cases, and cases picked by hand")} count={data.learnedPool} unit={tr(data.learnedPool === 1 ? "case" : "cases")}
          lit={data.learnedPool > 0} onPress={() => onOpen("learned")} accessibilityLabel={tr("Learned, {0}", { 0: plural(data.learnedPool, "case") })}>
          <View className="flex-row items-center gap-1.5">
            <Pill accent>{tr("{0} recommended", { 0: recommendedPicked })}</Pill>
            <Pill>{tr("{0} picked", { 0: handPicked })}</Pill>
            <View className="flex-1" />
            <Text className="text-sm font-bold text-primary">{tr("Choose")}</Text>
            <Icon as={ChevronRight} size={16} className="text-primary" />
          </View>
        </ModeCard>
        <ModeCard icon={Layers} title={tr("Whole sets")} summary={tr("Every learned case of the sets you choose")} count={data.whole} unit={tr(data.whole === 1 ? "case" : "cases")} lit={data.whole > 0}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5">
            {data.setRows.map(({ set, learned }) => learned
              ? <Chip key={set.id} on={trainSets.includes(set.id)} onPress={() => setTrainSets(trainSets.includes(set.id) ? trainSets.filter(id => id !== set.id) : [...trainSets, set.id])}
                accessibilityLabel={tr("{0}, {1} learned", { 0: tr(set.label), 1: learned })}>
                <Text className={cn("text-sm font-bold", trainSets.includes(set.id) && "text-primary-foreground")}>{tr(set.label)} <Numeric className={cn("text-sm font-bold", trainSets.includes(set.id) ? "text-primary-foreground" : "text-primary")}>{learned}</Numeric></Text>
              </Chip>
              : <Chip key={set.id} onPress={() => openCourse(set.id)} className="bg-transparent">
                <Text className="text-sm text-muted-foreground">{tr("{0} · see Courses", { 0: tr(set.label) })}</Text>
              </Chip>)}
          </ScrollView>
        </ModeCard>
        <ModeCard icon={Dices} title={tr("Free practice")} summary={tr("Any case of the catalogue, learned or not")} count={free || undefined} unit={free ? tr(free === 1 ? "case" : "cases") : undefined}>
          <View className="flex-row items-center gap-1.5">
            <Chip icon={Search} onPress={() => setPicking(true)}>{tr("Pick…")}</Chip>
            <View className="flex-1" />
            {free > 0 && <StartChip onPress={() => onStart("free")} />}
          </View>
        </ModeCard>
      </View>
    </ScrollView>
    <CasesBar data={data} onTrain={() => onStart("cases")} />
    <PickSheet open={picking} onClose={() => setPicking(false)} free />
  </View>;
}

/** What the cases' training drills (the recommended, the whole sets, those by hand), with Random AUF and Train. */
function CasesBar({ data, onTrain }: { data: TrainingData; onTrain: () => void }) {
  const [auf, setAuf] = useAtom(randomAufAtom);
  const cube = !!puzzleInfo(data.puzzle).cubeSize;
  return <View className="flex-row items-center gap-2 border-t border-border px-4 py-2">
    <View className="min-w-0 flex-1">
      <View className="flex-row items-baseline gap-1.5">
        <Numeric className="text-2xl font-extrabold tracking-tight">{data.pool.length}</Numeric>
        <Text className="text-sm font-bold">{tr(data.pool.length === 1 ? "case" : "cases")}</Text>
      </View>
      <Text numberOfLines={1} className="text-xs text-muted-foreground">{data.parts.length ? said(data.parts.join(" · ")) : tr("Nothing picked yet")}</Text>
    </View>
    {cube && <Chip icon={Shuffle} on={auf} onPress={() => setAuf(!auf)}>{tr("Random AUF")}</Chip>}
    <Pressable accessibilityRole="button" accessibilityLabel={tr("Train")} disabled={!data.pool.length} onPress={onTrain}
      className={cn("h-11 flex-row items-center gap-1.5 rounded-full bg-primary px-4 active:bg-primary/85", !data.pool.length && "opacity-45")}>
      <Icon as={Play} size={16} className="text-primary-foreground" fill="currentColor" />
      <Text className="text-base font-bold text-primary-foreground">{tr("Train")}</Text>
    </Pressable>
  </View>;
}

/** The time of a case, in seconds to the hundredth. */
const sec = (ms: number) => (ms / 1000).toFixed(2);

/**
 * Learned, pushed from Training: the recommended cases with their bars against the usual (each picked or not), then
 * the learned cases case by case, set by set; the search opens in a sheet.
 */
export function LearnedSetup({ onBack, onTrain }: { onBack: () => void; onTrain: () => void }) {
  useBackTo(onBack);
  const data = useTrainingData();
  const setRoute = useSetAtom(routeAtom);
  const sets = useAtomValue(setsAtom);
  const [hand, setHand] = useAtom(selectedCaseIdsAtom);
  const setPicks = useSetAtom(trainPicksAtom);
  const [searching, setSearching] = useState(false);
  const learnedCases = useMemo(() => data.cases.filter(c => data.learned.has(c.id)), [data.cases, data.learned]);
  const picked = hand.filter(id => data.learned.has(id)).length;
  const scale = Math.max(1, ...data.recommended.map(r => Math.max(r.time, r.usual) * 1.12));
  const picks = new Set(data.picks);
  const header = <View className="gap-2 pb-2">
    <View className="flex-row items-baseline justify-between gap-2">
      <Text className="text-xl font-extrabold tracking-tight">{tr("Recommended")}</Text>
      <Text numberOfLines={1} className="shrink text-[13px] text-muted-foreground">{tr("your slowest learned cases")}</Text>
    </View>
    {!data.totalLearned ? <Empty icon={GraduationCap} title={tr("Nothing learned yet")} className="flex-none py-6">
      {tr("The training drills the cases you learned. Learn them in the courses first.")}
      <Chip icon={GraduationCap} on onPress={() => setRoute({ page: "learn" })}>{tr("Open the courses")}</Chip>
    </Empty> : !data.recommended.length ? <Empty icon={Timer} title={tr("No recommendation yet")} className="flex-none py-6">
      {tr("Train your learned cases a few times each: the slowest show up here.")}
    </Empty> : data.recommended.map(r => {
      const c = data.cases.find(x => x.id === r.id);
      return c ? <RecommendedRow key={r.id} r={r} c={c} scale={scale} picked={picks.has(r.id)}
        onToggle={() => setPicks(picks.has(r.id) ? data.picks.filter(id => id !== r.id) : [...data.picks, r.id])} /> : null;
    })}
    <View className="flex-row items-center gap-2 pt-3">
      <View className="min-w-0 flex-1">
        <Text className="text-base font-extrabold">{tr("Case by case")}</Text>
        <Text numberOfLines={1} className="text-[13px] text-muted-foreground">{tr("among your {0} learned", { 0: data.totalLearned })} · <Numeric className="text-[13px] font-bold text-foreground">{picked}</Numeric> {tr("picked")}</Text>
      </View>
      <HeadButton icon={Search} label={tr("Search cases")} disabled={!data.totalLearned} onPress={() => setSearching(true)} />
      <Chip onPress={() => setHand([])} disabled={!hand.length}>{tr("Clear")}</Chip>
    </View>
  </View>;
  return <View className="flex-1">
    <PushedBar title={tr("Learned")} sub={tr("{0} recommended · {1} picked by hand", { 0: data.picks.filter(id => data.learned.has(id)).length, 1: picked })} onBack={onBack} />
    <View className="min-h-0 flex-1 px-1">
      <CaseSelector cases={learnedCases} sets={sets} selected={hand} onChange={setHand} query="" header={header}
        onOpenCase={caseId => setRoute({ page: "algorithms", caseId })} />
    </View>
    <CasesBar data={data} onTrain={onTrain} />
    <PickSheet open={searching} onClose={() => setSearching(false)} />
  </View>;
}

/** A recommended case: picked or not, its diagram, name and why, then its time against its set's usual. */
function RecommendedRow({ r, c, scale, picked, onToggle }: { r: Recommendation; c: CaseDto; scale: number; picked: boolean; onToggle: () => void }) {
  const Source = r.source === "solves" ? Rotate3d : Timer;
  return <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: picked }} accessibilityLabel={tr(c.name)}
    className="flex-row items-center gap-2.5 rounded-2xl bg-card px-2.5 py-2 active:bg-muted/60">
    <View className={cn("size-6 items-center justify-center rounded-md border-2", picked ? "border-primary bg-primary" : "border-muted-foreground/50")}>
      {picked && <Icon as={Check} size={14} strokeWidth={3} className="text-primary-foreground" />}
    </View>
    <CaseDiagram c={c} size={40} />
    <View className="min-w-0 flex-1 gap-1">
      <View className="flex-row items-baseline gap-1.5">
        <Text numberOfLines={1} className="shrink text-[15px] font-extrabold">{tr(c.name)}</Text>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-muted-foreground">{tr(c.setLabel)} · {tr(c.group)}</Text>
        <Numeric className="text-sm font-bold text-destructive">{tr("{0} s", { 0: sec(r.time) })}</Numeric>
      </View>
      <View className="h-1.5 rounded-full bg-muted">
        <View className="absolute inset-y-0 left-0 rounded-full bg-destructive" style={{ width: `${(r.time / scale) * 100}%` }} />
        <View className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground" style={{ left: `${(r.usual / scale) * 100}%` }} />
      </View>
      <View className="flex-row items-center gap-1">
        <Icon as={Source} size={12} className="text-muted-foreground" />
        <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-muted-foreground">
          {r.source === "solves" ? tr("seen in {0} of your solves", { 0: r.count }) : tr("{0} in training", { 0: plural(r.count, "attempt") })} · {recommendedWhy(r)} · {tr("usual {0}", { 0: sec(r.usual) })}
        </Text>
      </View>
    </View>
  </Pressable>;
}

/**
 * The cases to pick by hand, in a sheet: the search on top, then set by set (the learned cases for Learned, every
 * case for free practice), the count picked and Clear.
 */
function PickSheet({ open, onClose, free = false }: { open: boolean; onClose: () => void; free?: boolean }) {
  const cases = useAtomValue(casesAtom), sets = useAtomValue(setsAtom), learnedIds = useAtomValue(learnedCaseIdsAtom);
  const [hand, setHand] = useAtom(selectedCaseIdsAtom), [freePicks, setFreePicks] = useAtom(freePicksAtom);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => free ? cases : cases.filter(c => learnedIds.includes(c.id)), [free, cases, learnedIds]);
  const selected = free ? freePicks : hand, setSelected = free ? setFreePicks : setHand;
  const count = shown.filter(c => selected.includes(c.id)).length;
  return <Sheet open={open} onClose={onClose} title={tr("Pick cases")} description={free ? tr("Among every case, learned or not") : tr("Among the cases you learned")} contentClassName="gap-2 px-0"
    right={<Text className="text-sm text-muted-foreground"><Numeric className="text-base font-extrabold text-foreground">{count}</Numeric> {tr("picked")}</Text>}>
    {open && <>
      <View className="flex-row items-center gap-2 px-4">
        <SearchField value={query} onChangeText={setQuery} placeholder={tr("Search cases…")} className="flex-1" autoFocus={!free} />
        <Chip onPress={() => setSelected([])} disabled={!selected.length}>{tr("Clear")}</Chip>
      </View>
      <CaseSelector cases={shown} sets={sets as SetDto[]} selected={selected} onChange={setSelected} query={query} inSheet />
    </>}
  </Sheet>;
}
