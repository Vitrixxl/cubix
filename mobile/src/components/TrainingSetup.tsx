import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Brain, CalendarClock, Check, CircleHelp, Dices, Eye, GraduationCap, Layers, ListChecks, Play, Rotate3d, Search, Shuffle, Target, Timer, type LucideIcon } from "lucide-react-native";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { plural } from "../../../src/client/lib/format";
import { dueCases, recommend, recommendedWhy, trainingPool, type Recommendation } from "../../../src/client/lib/trainingPicks";
import { groupBySet } from "../../../src/client/lib/practiceCatalog";
import { CROSS_METHODS, CROSS_MOVES, CROSS_OPTIONS, CROSS_TARGET_LABELS } from "../../../src/shared/crossTraining";
import { puzzleInfo } from "../../../src/shared/puzzles";
import type { CaseDto, SetDto } from "../../../src/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
  bldWordsAtom, casesAtom, crossMovesAtom, crossTargetAtom, guidesAtom, learnedCaseIdsAtom, perPuzzleAtom, persisted, puzzleAtom, randomAufAtom, routeAtom,
  selectedCaseIdsAtom, setsAtom, statsAtom, type TrainingRun,
} from "../state";
import { AppBar, PushedBar, SectionTabs } from "./AppBar";
import { CaseDiagram } from "./CaseDiagram";
import { CaseSelector } from "./CaseSelector";
import { Chip } from "./Chips";
import { Bar, Choice, Empty, HeadButton, Label, Numeric, SearchField, Segmented } from "./layout";
import { useBackTo } from "./Practice";
import { useLayout } from "../hooks/useLayout";
import { Sheet } from "./Sheet";
import { useTourTarget } from "../tour";
import { hintsForStage } from "../lib/caseState";
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
/** Whether the recognition draws a last layer case from above with all its sides, or as held, its back unseen. */
export const recognitionBackAtom = persisted<boolean>("cubix.training.recognitionBack", true);
const RECOGNITION_SECONDS = [1, 2, 3, 5, 8];

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
    const bySet = groupBySet(cases);
    const rows = sets.flatMap(set => {
      const all = bySet.get(set.id) ?? [];
      return all.length ? [{ set, all, learned: all.filter(c => learned.has(c.id)).length }] : [];
    });
    return [...rows.filter(x => x.learned), ...rows.filter(x => !x.learned)];
  }, [sets, cases, learned]);
  const pool = useMemo(() => trainingPool(cases, learned, { picks, sets: trainSets, hand }), [cases, learned, picks, trainSets, hand]);
  const known = (ids: string[]) => ids.filter(id => learned.has(id)).length;
  const learnedPool = useMemo(() => trainingPool(cases, learned, { picks, hand }).length, [cases, learned, picks, hand]);
  const whole = setRows.reduce((n, x) => n + (trainSets.includes(x.set.id) ? x.learned : 0), 0);
  const chosen = [
    ...(known(picks) ? [tr("{0} recommended", { 0: known(picks) })] : []),
    ...setRows.flatMap(x => trainSets.includes(x.set.id) && x.learned ? [tr("{0} · {1} learned", { 0: tr(x.set.label), 1: x.learned })] : []),
    ...(known(hand) ? [tr("{0} by hand", { 0: known(hand) })] : []),
  ];
  // Nothing chosen: the training drills every learned case (`trainingPool`).
  const parts = chosen.length || !pool.length ? chosen : [tr("All learned cases")];
  const recognition = setRows.find(x => x.set.id === choice && x.learned) ?? setRows.find(x => x.learned);
  // The learned cases due for review (spaced repetition, `caseDue`).
  const due = useMemo(() => dueCases(cases, learned, [...stats.values()]), [cases, learned, stats]);
  return { puzzle, cases, learned, recommended, picks, due, hand, trainSets, setRows, pool, learnedPool, whole, parts, recognition, totalLearned: setRows.reduce((n, x) => n + x.learned, 0) };
}
export type TrainingData = ReturnType<typeof useTrainingData>;


/**
 * A way of training as a card: its icon and name, its number large with what it counts, then its one action (Start,
 * or Pick…). A tap anywhere else opens its settings.
 */
function ModeCard({ icon, title, count, unit, lit = false, action, onPress, children, accessibilityLabel }: {
  icon: LucideIcon; title: string; count?: number | string; unit?: string; lit?: boolean; action?: ReactNode; onPress: () => void; children?: ReactNode; accessibilityLabel?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={onPress}
    className={cn("gap-2.5 rounded-2xl p-3 active:opacity-80", lit ? "border border-primary bg-primary/10" : "bg-card")}>
    <View className="flex-row items-center gap-3">
      <View className={cn("size-10 items-center justify-center rounded-xl", lit ? "bg-card" : "bg-muted")}><Icon as={icon} size={20} className={lit ? "text-primary" : "text-muted-foreground"} /></View>
      <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-extrabold tracking-tight">{title}</Text>
      {count !== undefined && <View className="items-end">
        <Numeric className={cn("text-2xl leading-7 font-extrabold tracking-tight", !count && "text-muted-foreground/50")}>{count}</Numeric>
        {unit ? <Text numberOfLines={1} className="max-w-24 text-xs text-muted-foreground">{unit}</Text> : null}
      </View>}
      {action}
    </View>
    {children}
  </Pressable>;
}

/** The start of a card's training, as a pill. */
const StartChip = ({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) =>
  <Chip icon={Play} onPress={onPress} disabled={disabled}>{tr("Start")}</Chip>;

/** The start of a way of training at the bottom of its settings' drawer. */
const StartButton = ({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) =>
  <Button accessibilityLabel={tr("Start")} disabled={disabled} onPress={onPress} className="h-12 rounded-full">
    <Icon as={Play} size={16} className="text-primary-foreground" fill="currentColor" />
    <Text className="text-base font-bold">{tr("Start")}</Text>
  </Button>;

/** A setting in a drawer: its name small above its choices. */
const Field = ({ label, children }: { label: string; children: ReactNode }) => <View className="gap-2">
  <Label className="font-bold tracking-widest uppercase">{label}</Label>
  {children}
</View>;

/**
 * The Training tab: the five ways of training, each a card with its count and Start; a tap opens its settings in a
 * drawer (the step and its moves, the recognition's set, seconds and AUF, the whole sets with Random AUF and Train,
 * the free practice's cases), Start at the bottom; Learned opens its own screen, with Random AUF and Train. A tablet
 * shows Learned on the page and the ways in a sheet.
 */
export function TrainHome({ onOpen, onStart }: { onOpen: (mode: string) => void; onStart: (run: TrainingRun) => void }) {
  const data = useTrainingData();
  const openGuide = useSetAtom(guidesAtom);
  const [target, setTarget] = useAtom(crossTargetAtom), [moves, setMoves] = useAtom(crossMovesAtom);
  const [trainSets, setTrainSets] = useAtom(trainSetsAtom);
  const setRecognition = useSetAtom(recognitionChoiceAtom);
  const [seconds, setSeconds] = useAtom(recognitionSecondsAtom);
  const [auf, setAuf] = useAtom(randomAufAtom);
  const [back, setBack] = useAtom(recognitionBackAtom);
  const freePicks = useAtomValue(freePicksAtom);
  const words = Object.values(useAtomValue(bldWordsAtom)).filter(Boolean).length;
  const setHand = useSetAtom(selectedCaseIdsAtom), setRoute = useSetAtom(routeAtom), sets = useAtomValue(setsAtom);
  const [query, setQuery] = useState("");
  const learnedCases = useMemo(() => data.cases.filter(c => data.learned.has(c.id)), [data.cases, data.learned]);
  const [picking, setPicking] = useState(false);
  // The way whose settings show in their drawer.
  const [settings, setSettings] = useState<"" | "cross" | "recognition" | "sets">("");
  const [waysOpen, setWaysOpen] = useState(false), [searching, setSearching] = useState(false);
  const { tablet, wide } = useLayout();
  // A start closes the drawers it was made from first (a way's settings, the tablet's sheet of the ways).
  const start = (run: TrainingRun) => { setSettings(""); setPicking(false); setWaysOpen(false); onStart(run); };
  const cube = !!puzzleInfo(data.puzzle).cubeSize;
  const free = freePicks.filter(id => data.cases.some(c => c.id === id)).length;
  const chosen = data.recognition;
  const handPicked = data.hand.filter(id => data.learned.has(id)).length;
  const tour = useTourTarget("training");
  // The hidden stickers of the recognition's cube, for the sets read on them (the last layer's sides, an F2L pair's back).
  const hidden = cube && !!chosen && hintsForStage(chosen.set.stage);
  const toggleSet = (id: string) => setTrainSets(trainSets.includes(id) ? trainSets.filter(x => x !== id) : [...trainSets, id]);
  const ofSet = (x: TrainingData["setRows"][number]) => tr("{0} · {1} of {2}", { 0: tr(x.set.label), 1: x.learned, 2: x.all.length });
  const ways = <View {...(tablet ? {} : tour)} accessibilityLabel={tr("Ways of training")} className="gap-2">
        {data.puzzle === "333" && <ModeCard icon={Target} title={tr("Steps")} count={moves || "–"} unit={tr(CROSS_TARGET_LABELS[target])}
          onPress={() => setSettings("cross")} action={<StartChip onPress={() => start("cross")} />} />}
        <ModeCard icon={Eye} title={tr("Recognition")} count={chosen?.learned ?? 0} unit={chosen ? tr(chosen.set.label) : tr("cases")}
          onPress={() => setSettings("recognition")} action={<StartChip onPress={() => start("recognition")} disabled={!chosen} />}>
          {chosen && <Bar ratio={chosen.learned / chosen.all.length} />}
        </ModeCard>
        <ModeCard icon={CalendarClock} title={tr("Revision")} count={data.due.length} unit={tr("due today")} lit={data.due.length > 0}
          onPress={() => data.due.length && start("review")} action={<StartChip onPress={() => start("review")} disabled={!data.due.length} />} />
        <ModeCard icon={GraduationCap} title={tr("Learned")} count={data.learnedPool} unit={tr(data.learnedPool === 1 ? "case" : "cases")}
          lit={data.learnedPool > 0} onPress={tablet ? () => setWaysOpen(false) : () => onOpen("learned")} accessibilityLabel={tr("Learned, {0}", { 0: plural(data.learnedPool, "case") })}
          action={<StartChip onPress={() => start("cases")} disabled={!data.pool.length} />} />
        <ModeCard icon={Layers} title={tr("Whole sets")} count={data.whole} unit={tr(data.whole === 1 ? "case" : "cases")} lit={data.whole > 0}
          onPress={() => setSettings("sets")} action={<StartChip onPress={() => start("cases")} disabled={!data.whole} />} />
        <ModeCard icon={Dices} title={tr("Free practice")} count={free} unit={tr(free === 1 ? "case" : "cases")} onPress={() => setPicking(true)}
          action={free > 0 ? <StartChip onPress={() => start("free")} /> : <Chip icon={Search} onPress={() => setPicking(true)}>{tr("Pick…")}</Chip>} />
        {data.puzzle === "333" && <ModeCard icon={Brain} title={tr("BLD")} count={words} unit={tr(words === 1 ? "word" : "words")}
          onPress={() => start("bld")} action={<StartChip onPress={() => start("bld")} />} />}
      </View>;
  // Each way's settings in a drawer over the page, Start at the bottom; free practice's are its cases to pick.
  const sheets = <>
    <Sheet open={settings === "cross"} onClose={() => setSettings("")} title={tr("Steps")} scroll>
      {/* The steps method by method, then the number of moves of one drawn by it. */}
      {CROSS_METHODS.map(method => <Field key={method} label={method}>
        <Choice label={method} value={target} onChange={setTarget} options={CROSS_OPTIONS.filter(o => o.group === method)} />
      </Field>)}
      {!!moves && <Field label={tr("Moves")}>
        <Segmented label={tr("Moves")} value={String(moves)} onChange={n => setMoves(Number(n))} options={CROSS_MOVES[target].map(n => ({ id: String(n), label: tr("{0} moves", { 0: n }) }))} />
      </Field>}
      <StartButton onPress={() => start("cross")} />
    </Sheet>
    <Sheet open={settings === "recognition"} onClose={() => setSettings("")} title={tr("Recognition")} scroll>
      <Field label={tr("Set")}>
        {chosen && <Choice label={tr("Set")} value={chosen.set.id} onChange={setRecognition} options={data.setRows.filter(x => x.learned).map(x => ({ id: x.set.id, label: ofSet(x) }))} />}
      </Field>
      <Field label={tr("Seconds per case")}>
        <Segmented label={tr("Seconds per case")} value={String(seconds)} onChange={n => setSeconds(Number(n))} options={RECOGNITION_SECONDS.map(n => ({ id: String(n), label: tr("{0} s", { 0: n }) }))} />
      </Field>
      {cube && <View className="flex-row flex-wrap gap-1.5">
        <Chip icon={Shuffle} on={auf} onPress={() => setAuf(!auf)}>{tr("Random AUF")}</Chip>
        {hidden && <Chip icon={Rotate3d} on={back} onPress={() => setBack(!back)} accessibilityLabel={tr("Show the stickers hidden at the back")}>{tr("Back stickers")}</Chip>}
      </View>}
      <StartButton onPress={() => start("recognition")} disabled={!chosen} />
    </Sheet>
    <Sheet open={settings === "sets"} onClose={() => setSettings("")} title={tr("Whole sets")} scroll>
      <View className="flex-row flex-wrap gap-1.5">
        {data.setRows.filter(x => x.learned).map(({ set, learned }) => <Chip key={set.id} on={trainSets.includes(set.id)} onPress={() => toggleSet(set.id)}
          accessibilityLabel={tr("{0}, {1} learned", { 0: tr(set.label), 1: learned })}>
          <Text className={cn("text-sm font-bold", trainSets.includes(set.id) && "text-primary-foreground")}>{tr(set.label)} <Numeric className={cn("text-sm font-bold", trainSets.includes(set.id) ? "text-primary-foreground" : "text-primary")}>{learned}</Numeric></Text>
        </Chip>)}
      </View>
      {/* The sets join the cases Train drills, with the recommended and those picked by hand. */}
      <CasesBar data={data} onTrain={() => start("cases")} className="-mx-5 px-5" />
    </Sheet>
    <PickSheet open={picking} onClose={() => setPicking(false)} free onStart={free > 0 ? () => start("free") : undefined} />
  </>;
  const head = <>
    <AppBar><HeadButton icon={CircleHelp} label={tr("Help")} onPress={() => openGuide("training")} /></AppBar>
    <SectionTabs />
  </>;
  if (tablet) {
    // A tablet shows what Train drills (the recommended, two by two, and the cases picked by hand); the ways of training
    // are tiles peeking above the bar with Train, or chips over the page when wide, and each opens their settings in a sheet.
    const openWays = () => setWaysOpen(true);
    const tiles: { icon: LucideIcon; label: string; detail: string; on?: boolean }[] = [
      ...(data.puzzle === "333" ? [{ icon: Target, label: tr("Steps"), detail: moves ? `${tr(CROSS_TARGET_LABELS[target])} · ${moves}` : tr(CROSS_TARGET_LABELS[target]) }] : []),
      { icon: Eye, label: tr("Recognition"), detail: chosen ? `${chosen.learned} · ${tr(chosen.set.label)}` : "–" },
      { icon: GraduationCap, label: tr("Learned"), detail: plural(data.learnedPool, "case"), on: true },
      { icon: Layers, label: tr("Whole sets"), detail: plural(data.whole, "case") },
      { icon: Dices, label: tr("Free practice"), detail: free ? plural(free, "case") : tr("Pick…") },
      ...(data.puzzle === "333" ? [{ icon: Brain, label: tr("BLD"), detail: `${words} ${tr(words === 1 ? "word" : "words")}` }] : []),
    ];
    const train = (detail: string) => <Pressable accessibilityRole="button" accessibilityLabel={tr("Train")} disabled={!data.pool.length} onPress={() => onStart("cases")}
      className={cn("h-12 min-w-0 flex-1 flex-row items-center justify-between gap-3 rounded-2xl bg-primary px-4 active:bg-primary/85", !data.pool.length && "opacity-45")}>
      <View className="flex-row items-center gap-1.5">
        <Icon as={Play} size={16} className="text-primary-foreground" fill="currentColor" />
        <Text className="text-base font-bold text-primary-foreground">{tr("Train")}</Text>
      </View>
      <Text numberOfLines={1} className="shrink text-[13px] text-primary-foreground/75">{detail}</Text>
    </Pressable>;
    return <View className="flex-1">
      {head}
      <View className="min-h-0 flex-1 flex-row">
        <View className="min-w-0 flex-1">
          {wide && <View {...tour} accessibilityLabel={tr("Ways of training")} className="flex-row flex-wrap gap-2 px-7 pt-4">
            {tiles.map(t => <Chip key={t.label} icon={t.icon} on={t.on} onPress={openWays} className="h-11 px-4">{`${t.label} · ${t.detail}`}</Chip>)}
          </View>}
          <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-3 px-7 pt-4 pb-3" showsVerticalScrollIndicator={false}>
            <Recommended data={data} grid />
            {!wide && <View className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3">
              <Icon as={ListChecks} size={20} className="text-muted-foreground" />
              <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-extrabold">{tr("Case by case")}</Text>
              <Numeric className="text-[13px] text-muted-foreground">{tr("{0} picked", { 0: handPicked })}</Numeric>
              <Chip onPress={() => setHand([])} disabled={!data.hand.length}>{tr("Clear")}</Chip>
              <Chip icon={Search} onPress={() => setSearching(true)} disabled={!data.totalLearned}>{tr("Pick…")}</Chip>
            </View>}
          </ScrollView>
          {!wide && <View {...tour} className="mb-2 w-full max-w-[620px] gap-3 self-center rounded-[22px] border border-border bg-popover p-4">
            <View accessibilityLabel={tr("Ways of training")} className="flex-row gap-2">
              {tiles.map(t => <Pressable key={t.label} accessibilityRole="button" accessibilityLabel={`${t.label}, ${t.detail}`} onPress={openWays}
                className={cn("h-[68px] min-w-0 flex-1 items-center justify-center gap-0.5 rounded-2xl px-1", t.on ? "bg-primary active:bg-primary/85" : "bg-card active:bg-muted")}>
                <Icon as={t.icon} size={18} className={t.on ? "text-primary-foreground" : "text-muted-foreground"} />
                <Text numberOfLines={1} className={cn("text-[13px] font-bold", t.on ? "text-primary-foreground" : "text-muted-foreground")}>{t.label}</Text>
                <Text numberOfLines={1} className={cn("text-[11px] font-semibold", t.on ? "text-primary-foreground/75" : "text-muted-foreground/70")}>{t.detail}</Text>
              </Pressable>)}
            </View>
            <View className="flex-row items-center gap-2">
              {cube && <Chip icon={Shuffle} on={auf} onPress={() => setAuf(!auf)} className="h-12 px-4">{tr("Random AUF")}</Chip>}
              {train([plural(data.pool.length, "case"), ...data.parts].join(" · "))}
            </View>
          </View>}
        </View>
        {wide && <View className="m-3 mt-4 ml-0 w-[400px] gap-3 rounded-[26px] border border-border bg-card p-4">
          <Text className="text-xl font-extrabold tracking-tight">{tr("Case by case")}</Text>
          <View className="flex-row items-center gap-2">
            <View className="flex-row items-baseline gap-1">
              <Numeric className="text-2xl font-extrabold tracking-tight">{handPicked}</Numeric>
              <Text className="text-sm text-muted-foreground">{tr("picked")}</Text>
            </View>
            <SearchField value={query} onChangeText={setQuery} placeholder={tr("Search cases…")} className="flex-1" />
            <Chip onPress={() => setHand([])} disabled={!data.hand.length}>{tr("Clear")}</Chip>
          </View>
          <View className="-mx-3 min-h-0 flex-1">
            <CaseSelector cases={learnedCases} sets={sets} selected={data.hand} onChange={setHand} query={query} onOpenCase={caseId => setRoute({ page: "algorithms", caseId })} />
          </View>
          <View className="flex-row items-center gap-2">
            {cube && <HeadButton icon={Shuffle} label={tr("Random AUF") + " " + (auf ? tr("· on") : tr("· off"))} active={auf} onPress={() => setAuf(!auf)} />}
            {train(plural(data.pool.length, "case"))}
          </View>
        </View>}
      </View>
      <Sheet open={waysOpen} onClose={() => setWaysOpen(false)} title={tr("Ways of training")} scroll>{ways}</Sheet>
      {sheets}
      <PickSheet open={searching} onClose={() => setSearching(false)} />
    </View>;
  }
  return <View className="flex-1">
    {head}
    <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-2 px-4 pt-3 pb-3" showsVerticalScrollIndicator={false}>
      {ways}
    </ScrollView>
    {sheets}
  </View>;
}

/** What the cases' training drills (the recommended, the whole sets, those by hand), with Random AUF and Train. */
function CasesBar({ data, onTrain, className }: { data: TrainingData; onTrain: () => void; className?: string }) {
  const [auf, setAuf] = useAtom(randomAufAtom);
  const cube = !!puzzleInfo(data.puzzle).cubeSize;
  return <View className={cn("flex-row items-center gap-2 border-t border-border px-4 py-2", className)}>
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
  const [searching, setSearching] = useState(false);
  const learnedCases = useMemo(() => data.cases.filter(c => data.learned.has(c.id)), [data.cases, data.learned]);
  const picked = hand.filter(id => data.learned.has(id)).length;
  const header = <View className="gap-2 pb-2">
    <Recommended data={data} />
    <View className="flex-row items-center gap-2 pt-3">
      <Text numberOfLines={1} className="min-w-0 flex-1 text-base font-extrabold">{tr("Case by case")}</Text>
      <Numeric className="text-[13px] text-muted-foreground">{tr("{0} picked", { 0: picked })}</Numeric>
      <HeadButton icon={Search} label={tr("Search cases")} disabled={!data.totalLearned} onPress={() => setSearching(true)} />
      <Chip onPress={() => setHand([])} disabled={!hand.length}>{tr("Clear")}</Chip>
    </View>
  </View>;
  return <View className="flex-1">
    <PushedBar title={tr("Learned")} onBack={onBack} />
    <View className="min-h-0 flex-1 px-1">
      <CaseSelector cases={learnedCases} sets={sets} selected={hand} onChange={setHand} query="" header={header}
        onOpenCase={caseId => setRoute({ page: "algorithms", caseId })} />
    </View>
    <CasesBar data={data} onTrain={onTrain} />
    <PickSheet open={searching} onClose={() => setSearching(false)} />
  </View>;
}

/**
 * The recommended cases (the learned ones slower than usual), each picked or not, or why there are none; `grid` lays
 * them two by two under a larger title (a tablet).
 */
function Recommended({ data, grid = false }: { data: TrainingData; grid?: boolean }) {
  const setRoute = useSetAtom(routeAtom), setPicks = useSetAtom(trainPicksAtom);
  const scale = Math.max(1, ...data.recommended.map(r => Math.max(r.time, r.usual) * 1.12));
  const picks = new Set(data.picks);
  const rows = data.recommended.flatMap(r => {
    const c = data.cases.find(x => x.id === r.id);
    return c ? [<RecommendedRow key={r.id} r={r} c={c} scale={scale} picked={picks.has(r.id)} large={grid}
      onToggle={() => setPicks(picks.has(r.id) ? data.picks.filter(id => id !== r.id) : [...data.picks, r.id])} />] : [];
  });
  return <>
    <Text className={cn("text-xl font-extrabold tracking-tight", grid && "text-[26px]")}>{tr("Recommended")}</Text>
    {!data.totalLearned ? <Empty icon={GraduationCap} title={tr("Nothing learned yet")} className="flex-none py-6">
      <Chip icon={GraduationCap} on accessibilityLabel={tr("Open the courses")} onPress={() => setRoute({ page: "learn" })}>{tr("Courses")}</Chip>
    </Empty> : !data.recommended.length ? <Empty icon={Timer} title={tr(data.trainSets.length || data.hand.some(id => data.learned.has(id)) ? "No recommendation yet" : "No recommendation: training all learned")} className="flex-none py-6" /> : grid ? Array.from({ length: Math.ceil(rows.length / 2) }, (_, i) => <View key={i} className="flex-row gap-3">
      {rows.slice(i * 2, i * 2 + 2).map(row => <View key={row.key} className="min-w-0 flex-1">{row}</View>)}
      {i * 2 + 1 >= rows.length && <View className="flex-1" />}
    </View>) : rows}
  </>;
}

/** A recommended case: picked or not, its diagram, name and why, then its time against its set's usual; `large` on a tablet. */
function RecommendedRow({ r, c, scale, picked, onToggle, large = false }: { r: Recommendation; c: CaseDto; scale: number; picked: boolean; onToggle: () => void; large?: boolean }) {
  const Source = r.source === "solves" ? Rotate3d : Timer;
  return <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: picked }} accessibilityLabel={tr(c.name)}
    className={cn("flex-row items-center gap-2.5 rounded-2xl bg-card px-2.5 py-2 active:bg-muted/60", large && "gap-3 px-4 py-3.5")}>
    <View className={cn("size-6 items-center justify-center rounded-md border-2", picked ? "border-primary bg-primary" : "border-muted-foreground/50")}>
      {picked && <Icon as={Check} size={14} strokeWidth={3} className="text-primary-foreground" />}
    </View>
    <CaseDiagram c={c} size={large ? 60 : 40} />
    <View className={cn("min-w-0 flex-1 gap-1", large && "gap-1.5")}>
      <View className="flex-row items-baseline gap-1.5">
        <Text numberOfLines={1} className="shrink text-[15px] font-extrabold">{tr(c.name)}</Text>
        <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-muted-foreground">{tr(c.setLabel)}</Text>
        <Numeric className="text-sm font-bold text-destructive">{tr("{0} s", { 0: sec(r.time) })}</Numeric>
      </View>
      <View className="h-1.5 rounded-full bg-muted">
        <View className="absolute inset-y-0 left-0 rounded-full bg-destructive" style={{ width: `${(r.time / scale) * 100}%` }} />
        <View className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground" style={{ left: `${(r.usual / scale) * 100}%` }} />
      </View>
      <View className="flex-row items-center gap-1">
        <Icon as={Source} size={12} className="text-muted-foreground" />
        <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-muted-foreground">
          {recommendedWhy(r)}
        </Text>
      </View>
    </View>
  </Pressable>;
}

/**
 * The cases to pick by hand, in a sheet: the search on top, then set by set (the learned cases for Learned, every
 * case for free practice), the count picked and Clear; `onStart` puts Start under them.
 */
function PickSheet({ open, onClose, free = false, onStart }: { open: boolean; onClose: () => void; free?: boolean; onStart?: () => void }) {
  const cases = useAtomValue(casesAtom), sets = useAtomValue(setsAtom), learnedIds = useAtomValue(learnedCaseIdsAtom);
  const [hand, setHand] = useAtom(selectedCaseIdsAtom), [freePicks, setFreePicks] = useAtom(freePicksAtom);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const learned = new Set(learnedIds);
    return free ? cases : cases.filter(c => learned.has(c.id));
  }, [free, cases, learnedIds]);
  const selected = free ? freePicks : hand, setSelected = free ? setFreePicks : setHand;
  const count = useMemo(() => {
    const picked = new Set(selected);
    return shown.filter(c => picked.has(c.id)).length;
  }, [shown, selected]);
  return <Sheet open={open} onClose={onClose} title={tr("Pick cases")} contentClassName="gap-2 px-0"
    right={<Text className="text-sm text-muted-foreground"><Numeric className="text-base font-extrabold text-foreground">{count}</Numeric> {tr("picked")}</Text>}>
    {open && <>
      <View className="flex-row items-center gap-2 px-4">
        <SearchField value={query} onChangeText={setQuery} placeholder={tr("Search cases…")} className="flex-1" autoFocus={!free} />
        <Chip onPress={() => setSelected([])} disabled={!selected.length}>{tr("Clear")}</Chip>
      </View>
      <CaseSelector cases={shown} sets={sets as SetDto[]} selected={selected} onChange={setSelected} query={query} inSheet />
      {onStart && <View className="px-5"><StartButton onPress={onStart} /></View>}
    </>}
  </Sheet>;
}
