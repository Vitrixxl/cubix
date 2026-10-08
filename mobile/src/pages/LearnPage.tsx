import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { BookA, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Dumbbell, Flag, GraduationCap, Lightbulb, Play, Route, Timer } from "lucide-react-native";
import { memo, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import {
  LEVEL_LABEL, algId, algSetup, courseEntry, firstOpenSet, goToStep, methodFacts, methodLearned, methodOf, methodProgress, methodShare, openCourse,
  recommendedMethod, setGroups, stepDone, stepId, stepLearned, stepMastered, stepSets, toggleAlgLearned, type CourseEntry,
} from "../../../src/client/lib/course";
import { isLearningTrack, orderedGroups } from "../../../src/client/lib/dailyLearning";
import { plural } from "../../../src/client/lib/format";
import { applyAlg, solved } from "../../../src/shared/cube";
import { viewForMask } from "../../../src/shared/cubeDiagram";
import { METHODS, type MethodAlgorithm, type MethodLevel, type MethodStep, type SolvingMethod } from "../../../src/shared/methods";
import { puzzleInfo, type PuzzleId } from "../../../src/shared/puzzles";
import type { CaseDto } from "../../../src/shared/types";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { local } from "../api";
import { Alg, BackButton, Choice, Empty, Figure, HeadButton, Label, LearnToggle, Page, PageHead, SectionHead, StatusMark } from "../components/layout";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PickerCard } from "../components/PickerCard";
import { PuzzleIcon, SessionButton } from "../components/PuzzlePicker";
import { Sheet } from "../components/Sheet";
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { AlgPlayerSheet, type PlayItem } from "../components/AlgPlayer";
import { CaseSheet, CaseTile, tileGrid } from "./AlgorithmsPage";
import { useLayout } from "../hooks/useLayout";
import { useTourTarget } from "../tour";
import { unlockPuzzleAtom } from "../journey";
import { storage } from "../platform/storage";
import {
  casesAtom, courseProgressAtom, goBackAtom, learnMethodAtom, learnedCaseIdsAtom, learningFilterAtom, notationAtom, previousRouteAtom, puzzleAtom,
  replaceRouteAtom, routeAtom, selectedCaseIdsAtom, setsAtom, statsAtom, trainingSetupModeAtom, trainingStepAtom,
} from "../state";
import { tr } from "../../../src/client/i18n";

/**
 * Learn, as the web app on a phone: the puzzle's methods as large cards, then the chosen one as a course, its steps in
 * a sheet, the current step's explanation, tips and algorithms, and Previous, Train, Done and Next under the thumb.
 * The route is passed in rather than read, so a page sliding out keeps showing what it showed.
 */
export function LearnPage({ method: methodId }: { method?: string }) {
  const puzzle = useAtomValue(puzzleAtom);
  const method = methodOf(puzzle, methodId);
  const setLearnMethod = useSetAtom(learnMethodAtom);
  useEffect(() => { setLearnMethod(method?.id); }, [method?.id, setLearnMethod]);
  return method ? <Course key={`${puzzle}:${method.id}`} puzzle={puzzle} method={method} /> : <Methods puzzle={puzzle} />;
}

/** A method's level as three rising bars: one lit for a first method, all three for a top-level one. */
function LevelBars({ level, on }: { level: MethodLevel; on: boolean }) {
  const lit = { beginner: 1, intermediate: 2, advanced: 3 }[level];
  return <View accessibilityLabel={tr(LEVEL_LABEL[level])} className="h-3.5 flex-row items-end gap-[3px]">
    {["h-1.5", "h-2.5", "h-3.5"].map((height, i) =>
      <View key={height} className={cn("w-[3px] rounded-[1px]", height, on ? "bg-primary" : "bg-muted-foreground", i >= lit && "opacity-25")} />)}
  </View>;
}

/** The methods of the puzzle as large cards in the middle of the page, each with the share of its algorithms known; a card opens its course where it was left. */
function Methods({ puzzle }: { puzzle: PuzzleId }) {
  const cases = useAtomValue(casesAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [progress, setProgress] = useAtom(courseProgressAtom);
  const setRoute = useSetAtom(routeAtom);
  const recommended = recommendedMethod(puzzle);
  const open = (id: string) => { setProgress(openCourse(progress, puzzle, id)); setRoute({ page: "learn", method: id }); };
  const list = useTourTarget("learn");
  return <Page className="pb-0">
    <PageHead title={tr("Learn")} sub={tr("Choose a {0} method, then follow it step by step", { 0: tr(puzzleInfo(puzzle).label) })}><SessionButton /></PageHead>
    <ScrollView className="-mx-4 flex-1" contentContainerClassName="flex-grow justify-center px-4 pt-1 pb-6" showsVerticalScrollIndicator={false}>
      <View {...list} accessibilityLabel={tr("Methods")} className="gap-3">
        {METHODS[puzzle].map(method => {
          const facts = methodFacts(method, cases), state = methodProgress(progress, puzzle, method, cases, learned);
          const known = methodLearned(method, cases, learned, courseEntry(progress, puzzle, method.id)), share = facts.algorithms ? known / facts.algorithms : 0;
          const isRecommended = method.id === recommended;
          const detail = `${tr(LEVEL_LABEL[method.level])} · ${plural(facts.steps, "step")}` + (state.started ? ` · ${tr("{0} of {1} steps learned", { 0: state.done, 1: state.total })}` : "");
          return <PickerCard key={method.id} accessibilityLabel={`${state.started ? tr("Continue") : tr("Start")} ${tr(method.name)}`} onPress={() => open(method.id)}
            icon={lit => <LevelBars level={method.level} on={lit} />} title={tr(method.name)} detail={tr(method.summary)}
            badge={state.started ? tr("In progress") : isRecommended ? tr("Recommended") : undefined} marked={isRecommended || state.started}
            meta={`${detail} · ${tr("{0} / {1} algorithms known · {2}%", { 0: known, 1: facts.algorithms, 2: Math.round(share * 100) })}`} progress={methodShare(method, cases, learned, progress, puzzle)} />;
        })}
      </View>
    </ScrollView>
  </Page>;
}

/** One algorithm a step teaches itself (the catalogue's cases are tiles in their groups). */
type Item = { key: string; name: string; detail?: string; alg: string; alternatives: string[]; note?: string; learned: boolean; step: MethodStep; own: MethodAlgorithm; play?: PlayItem };
type Row =
  | { kind: "alg"; key: string; item: Item }
  /** A group of the step's set: its shown cases (under the learned filter) and every case of it. */
  | { kind: "box"; key: string; name: string; members: CaseDto[]; total: CaseDto[] }
  | { kind: "empty"; key: string };

/** The case an inline algorithm solves, drawn like the catalogue's diagrams; puzzles without one keep their glyph. */
function InlineDiagram({ puzzle, step, alg, size }: { puzzle: PuzzleId; step: MethodStep; alg: MethodAlgorithm; size: number }) {
  const cube = puzzleInfo(puzzle).cubeSize, mask = step.mask ?? "full";
  const state = useMemo(() => cube ? applyAlg(solved(cube), algSetup(alg)) : null, [cube, alg]);
  if (!state) return <View className="items-center justify-center opacity-60" style={{ width: size, height: size }}><PuzzleIcon puzzle={puzzle} size={size * 0.5} /></View>;
  return <StaticCubeSvg state={state} size={size} mask={mask} view={viewForMask(mask)} />;
}

/** One algorithm: its case (a tap plays it in 3D), its name, the algorithm, how to hold the cube, its alternatives, then its learned toggle. */
const AlgRow = memo(function AlgRow({ item, puzzle, onToggle, onPlay }: { item: Item; puzzle: PuzzleId; onToggle: (item: Item) => void; onPlay: (item: Item) => void }) {
  const [open, setOpen] = useState(false);
  const diagram = <InlineDiagram puzzle={puzzle} step={item.step} alg={item.own} size={56} />;
  return <View className="flex-row items-center gap-5 py-2.5">
    {item.play ? <Pressable onPress={() => onPlay(item)} accessibilityRole="button" accessibilityLabel={tr("Play {0} in 3D", { 0: tr(item.name) })} className="rounded-md active:opacity-70">
      {diagram}
      <View className="absolute -right-1 -bottom-1 size-5 items-center justify-center rounded-full border border-border bg-background">
        <Icon as={Play} size={10} className="text-muted-foreground" fill="currentColor" />
      </View>
    </Pressable> : diagram}
    <View className="min-w-0 flex-1 gap-1.5">
      <View className="flex-row items-baseline gap-2">
        <Text numberOfLines={1} className="shrink text-sm font-medium">{tr(item.name)}</Text>
        {item.detail ? <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">{tr(item.detail)}</Text> : null}
      </View>
      <Alg text={item.alg} size={16} selectable />
      {item.note ? <Text className="text-xs text-muted-foreground">{tr(item.note)}</Text> : null}
      {item.alternatives.length > 0 && <View className="gap-1.5">
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="-ml-1 min-h-9 flex-row items-center gap-1 self-start rounded-md px-1 active:bg-muted/50">
          <Icon as={open ? ChevronDown : ChevronRight} size={14} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">{plural(item.alternatives.length, "alternative")}</Text>
        </Pressable>
        {open && item.alternatives.map((alt, i) => <Alg key={i} text={alt} size={14} className="opacity-70" selectable />)}
      </View>}
      <View className="items-end pt-1"><LearnToggle learned={item.learned} onPress={() => onToggle(item)} accessibilityLabel={item.learned ? tr("{0} learned", { 0: tr(item.name) }) : tr("Mark {0} learned", { 0: tr(item.name) })} /></View>
    </View>
  </View>;
});

/** The set each step shows, kept for the session (the web's `learnSets`): learning its last case never switches to another set. */
const learnSetsAtom = atom<Record<string, string>>({});
/** The order of the groups of the sets that are no learning track, set by set (a web preference). */
const GROUP_ORDER_KEY = "cubix.learn.groupOrder";
/** The order of a set's groups: a learning track's is its training's priority, any other set's a preference (web `groupOrder`). */
function groupOrder(setId: string): string[] | undefined {
  const track = setId.toUpperCase();
  if (isLearningTrack(track)) return local.learningGroupOrder()[track];
  try { return JSON.parse(storage.getItem(GROUP_ORDER_KEY) ?? "null")?.[setId]; } catch { return undefined; }
}

function Course({ puzzle, method }: { puzzle: PuzzleId; method: SolvingMethod }) {
  const [progress, setProgress] = useAtom(courseProgressAtom);
  const unlock = useSetAtom(unlockPuzzleAtom);
  const cases = useAtomValue(casesAtom), sets = useAtomValue(setsAtom), stats = useAtomValue(statsAtom);
  const [learnedIds, toggleLearned] = useAtom(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [filter, setFilter] = useAtom(learningFilterAtom);
  const previousRoute = useAtomValue(previousRouteAtom);
  const goBack = useSetAtom(goBackAtom), replaceRoute = useSetAtom(replaceRouteAtom), setRoute = useSetAtom(routeAtom), setSelection = useSetAtom(selectedCaseIdsAtom);
  const openNotation = useSetAtom(notationAtom);
  const setTrainingMode = useSetAtom(trainingSetupModeAtom), setTrainingStep = useSetAtom(trainingStepAtom);
  // An intuitive step with its own training mode opens it (Training → Cross).
  const openTraining = (mode: string) => { setTrainingMode(mode); setTrainingStep("setup"); setRoute({ page: "training" }); };
  const [learnSets, setLearnSets] = useAtom(learnSetsAtom);
  const [stepsOpen, setStepsOpen] = useState(false);
  // The course just finished: the page says so until a step is opened again.
  const [finished, setFinished] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  // The case of the step opened over the course (the web's case dialog).
  const [caseOpen, setCaseOpen] = useState<string | null>(null);
  const { size: tileSize } = tileGrid(useLayout().width - 32 - 26);
  const entry: CourseEntry = courseEntry(progress, puzzle, method.id);
  const step = method.steps[entry.step]!;
  // Every step's mark and the course's count, computed again only when the progress or the marks change.
  const stepsDone = useMemo(() => method.steps.map(st => stepDone(st, cases, learned, courseEntry(progress, puzzle, method.id))), [method, cases, learned, progress, puzzle]);
  const state = useMemo(() => methodProgress(progress, puzzle, method, cases, learned), [progress, puzzle, method, cases, learned]);
  const done = stepsDone[entry.step]!;
  const own = stepSets(step, sets, puzzle);
  const setKey = `${puzzle}:${method.id}:${entry.step}`;
  const chosen = own.find(s => s.id === learnSets[setKey]) ?? firstOpenSet(own, cases, learned);
  useEffect(() => { if (chosen && !learnSets[setKey]) setLearnSets(previous => ({ ...previous, [setKey]: chosen.id })); }, [setKey, chosen?.id]);
  const count = stepLearned(step, cases, learned, entry);
  const last = entry.step === method.steps.length - 1, next = method.steps[entry.step + 1];
  const shownByFilter = (on: boolean) => filter === "learned" ? on : filter === "not-learned" ? !on : true;
  const items = useMemo(() => {
    const size = puzzleInfo(puzzle).cubeSize;
    return (step.algs ?? []).map((alg): Item => {
      const id = algId(step, alg), algs = [alg.alg, ...(alg.alternatives ?? [])];
      return {
        key: id, name: alg.name, detail: alg.detail, alg: alg.alg, alternatives: alg.alternatives ?? [], note: alg.note, learned: entry.learned.includes(id), step, own: alg,
        play: size ? { key: id, name: alg.name, detail: alg.detail, context: step.title, algs, note: alg.note, size, mask: step.mask ?? "full", setup: alg.setup } : undefined,
      };
    });
  }, [puzzle, step, entry.learned]);
  const rows = useMemo(() => {
    const result: Row[] = items.filter(item => shownByFilter(item.learned)).map(item => ({ kind: "alg", key: item.key, item }));
    if (chosen) {
      // The set's groups in their saved order, each a box of tiles; a group the learned filter empties goes too.
      const byGroup = new Map(setGroups(cases, chosen.id));
      const groups = orderedGroups(cases.filter(c => c.set === chosen.id), groupOrder(chosen.id));
      let shown = 0;
      for (const group of groups) {
        const total = byGroup.get(group) ?? [], members = total.filter(c => shownByFilter(learned.has(c.id)));
        if (!members.length) continue;
        shown++;
        result.push({ kind: "box", key: `group:${group}`, name: groups.length > 1 ? group : chosen.label, members, total });
      }
      if (!shown && groups.length) result.push({ kind: "empty", key: "empty" });
    }
    return result;
  }, [items, chosen, cases, learned, filter]);
  // The algorithms the 3D player steps through: the step's own, in the list's order.
  const playable = useMemo(() => items.filter(item => item.play), [items]);
  const caseIds = useMemo(() => rows.flatMap(row => row.kind === "box" ? row.members.map(c => c.id) : []), [rows]);
  const back = () => {
    if (previousRoute?.page === "learn" && !previousRoute.method) goBack();
    else replaceRoute({ page: "learn" });
  };
  const go = (index: number) => { setFinished(false); setProgress(goToStep(progress, puzzle, method.id, index)); };
  const toggle = (item: Item) => setProgress(toggleAlgLearned(progress, puzzle, method.id, item.key));
  const play = (item: Item) => setPlaying(playable.indexOf(item));
  const train = () => {
    if (!chosen) return;
    setSelection(cases.filter(c => c.set === chosen.id).map(c => c.id));
    setRoute({ page: "training", autostart: true });
  };
  const header = <View className="gap-4 pb-2">
    <Text className="text-base text-foreground/85">{tr(step.text)}</Text>
    {step.tips?.length ? <View className="gap-1.5">
      <Label>{tr("Tips")}</Label>
      {step.tips.map(tip => <View key={tip} className="flex-row gap-2.5">
        <View className="mt-2 size-1 rounded-full bg-muted-foreground/60" />
        <Text className="min-w-0 flex-1 text-sm text-muted-foreground">{tr(tip)}</Text>
      </View>)}
    </View> : null}
    {step.missing ? <Alert>{tr(step.missing)}</Alert> : null}
    {count.total > 0 && <View className="gap-1 pt-1">
      <SectionHead title={tr("Algorithms")} meta={tr("{0} / {1} learned", { 0: count.learned, 1: count.total })}>
        <Pressable accessibilityRole="button" accessibilityLabel={tr("Notation")} onPress={() => openNotation(true)} className="-mr-2 h-11 flex-row items-center gap-1.5 rounded-lg px-2 active:bg-muted/50">
          <Icon as={BookA} size={15} className="text-muted-foreground" />
          <Text className="text-sm text-muted-foreground">{tr("Notation")}</Text>
        </Pressable>
      </SectionHead>
      <Choice label={tr("Filter")} value={filter} onChange={setFilter} options={[
        { id: "all", label: tr("All"), count: count.total },
        { id: "learned", label: tr("Learned"), count: count.learned },
        { id: "not-learned", label: tr("To learn"), count: count.total - count.learned },
      ]} />
      {own.length > 1 && chosen && <Choice label={tr("Set")} value={chosen.id} onChange={id => setLearnSets(previous => ({ ...previous, [setKey]: id }))}
        options={own.map(s => ({ id: s.id, label: s.label, count: s.count }))} />}
    </View>}
  </View>;
  const renderRow = ({ item: row }: { item: Row }) => {
    if (row.kind === "alg") return <AlgRow item={row.item} puzzle={puzzle} onToggle={toggle} onPlay={play} />;
    if (row.kind === "empty") return <Empty icon={Check}>{filter === "learned" ? tr("No learned cases in this set yet.") : tr("Every case of this set is learned.")}</Empty>;
    const known = row.total.filter(c => learned.has(c.id)).length;
    return <View accessibilityLabel={tr(row.name)} className="mt-3 gap-3 rounded-2xl border border-border bg-card p-3">
      <SectionHead title={row.name} meta={<Text className={cn("text-sm", known === row.total.length ? "text-success" : "text-muted-foreground/70")}>{known} / {row.total.length}</Text>} className="min-h-7" />
      <View className="flex-row flex-wrap gap-1.5">
        {row.members.map(c => <CaseTile key={c.id} c={c} size={tileSize} best={stats.get(c.id)?.best} learned={learned.has(c.id)} onOpen={setCaseOpen} onToggle={toggleLearned} />)}
      </View>
    </View>;
  };
  return <Page className="pb-0">
    <PageHead lead={<BackButton label={tr("Every method")} onPress={back} />} title={tr(method.name)} sub={tr("{0} · {1} of {2} steps learned", { 0: tr(puzzleInfo(puzzle).label), 1: state.done, 2: state.total })}>
      {/* The beginner 3×3 course can solve the player's own cube with them (AssistedPage). */}
      {puzzle === "333" && method.id === "beginner" && <HeadButton icon={Route} label={tr("Assisted solve")} onPress={() => setRoute({ page: "assisted" })} />}
    </PageHead>
    <View className="-mx-4 min-h-0 flex-1">
      <Pressable accessibilityRole="button" accessibilityLabel={finished ? tr("{0} done. Every step", { 0: tr(method.name) }) : tr("Step {0} of {1}: {2}. Every step", { 0: entry.step + 1, 1: method.steps.length, 2: tr(step.title) })} onPress={() => setStepsOpen(true)}
        className="mx-4 min-h-14 gap-2 rounded-2xl border border-border bg-card px-4 py-3 active:bg-muted/50">
        <View className="flex-row items-center gap-3">
          <StatusMark done={finished || done} current={!finished && !done} />
          <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
            <Text numberOfLines={1} className="min-w-0 flex-1 font-sans text-base font-semibold">{finished ? tr("{0} done", { 0: tr(method.name) }) : tr(step.title)}</Text>
            <Text className="font-sans text-xs text-muted-foreground">{finished ? method.steps.length : entry.step + 1} / {method.steps.length}</Text>
          </View>
          <Icon as={ChevronsUpDown} size={16} className="text-muted-foreground" />
        </View>
        <View className="flex-row gap-1" importantForAccessibility="no-hide-descendants">
          {method.steps.map((st, i) => <View key={st.title} className={cn("h-1 flex-1 rounded-full", stepsDone[i] || finished ? "bg-primary" : i === entry.step ? "bg-primary/25" : "bg-muted")} />)}
        </View>
      </Pressable>
      {finished ? <Finished puzzle={puzzle} method={method} onTimer={() => setRoute({ page: "playground" })} onMethods={back} /> : <>
        <FlatList key={`${entry.step}:${chosen?.id ?? ""}`} data={rows} keyExtractor={row => row.key} ListHeaderComponent={header} renderItem={renderRow}
          // A step without algorithms: nothing to memorise, the idea to practise in solves.
          ListEmptyComponent={count.total === 0 && !step.missing ? <Empty icon={Lightbulb} title={tr("An intuitive step")} className="py-8">{tr("Nothing to memorise here: understand the idea, then practise it in your solves.")}
            <LearnToggle mastery learned={stepMastered(step, entry)} accessibilityLabel={tr("Mastered")} onPress={() => setProgress(toggleAlgLearned(progress, puzzle, method.id, stepId(step)))} />
            {step.train && puzzle === "333" ? <Button className="h-11 gap-2" onPress={() => openTraining(step.train!)}>
              <Icon as={Dumbbell} size={16} className="text-primary-foreground" /><Text>{tr("Train the cross")}</Text>
            </Button> : <Button variant="outline" className="h-11 gap-2" onPress={() => setRoute({ page: "playground" })}>
              <Icon as={Timer} size={16} className="text-foreground" /><Text>{tr("Practise with the timer")}</Text>
            </Button>}
          </Empty> : null}
          initialNumToRender={10} maxToRenderPerBatch={8} windowSize={7}
          className="flex-1" contentContainerClassName="px-4 pt-4 pb-6" />
        <View className="flex-row items-center gap-1 border-t border-border bg-background px-3 py-2.5">
          <Pressable accessibilityRole="button" accessibilityLabel={tr("Previous step")} disabled={entry.step === 0} onPress={() => go(entry.step - 1)}
            className={cn("h-12 flex-row items-center gap-1 rounded-xl px-3 active:bg-muted/50", entry.step === 0 && "opacity-40")}>
            <Icon as={ChevronLeft} size={18} className="text-muted-foreground" />
            <Text className="text-sm font-medium text-muted-foreground">{tr("Previous")}</Text>
          </Pressable>
          {chosen && <Pressable accessibilityRole="button" accessibilityLabel={tr("Train {0}", { 0: tr(chosen.label) })} onPress={train} className="h-12 flex-row items-center gap-1.5 rounded-xl px-3 active:bg-muted/50">
            <Icon as={Timer} size={17} className="text-muted-foreground" />
            <Text className="text-sm font-medium text-muted-foreground">{tr("Train")}</Text>
          </Pressable>}
          {last
            ? <Pressable accessibilityRole="button" accessibilityLabel={tr("Finish")} onPress={() => { void unlock(method.id); setFinished(true); }}
              className="h-12 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-3 active:bg-primary/85">
              <Icon as={Flag} size={17} className="text-primary-foreground" />
              <Text className="text-base font-semibold text-primary-foreground">{tr("Finish")}</Text>
            </Pressable>
            : <Pressable accessibilityRole="button" accessibilityLabel={tr("Next step: {0}", { 0: tr(next!.title) })} onPress={() => go(entry.step + 1)}
              className="h-12 min-w-0 flex-1 flex-row items-center gap-2 rounded-xl bg-primary pr-2 pl-3.5 active:bg-primary/85">
              <Text numberOfLines={1} className="min-w-0 flex-1 font-sans text-sm font-semibold text-primary-foreground">{tr("Next · {0}", { 0: tr(next!.title) })}</Text>
              <Icon as={ChevronRight} size={18} className="text-primary-foreground" />
            </Pressable>}
        </View>
      </>}
    </View>
    <Sheet open={stepsOpen} onClose={() => setStepsOpen(false)} title={tr("Steps")} description={tr("{0} of {1} steps learned", { 0: state.done, 1: state.total })} scroll contentClassName="gap-0 px-2">
        {method.steps.map((st, i) => {
          const learnedHere = stepLearned(st, cases, learned, entry), here = i === entry.step && !finished;
          return <Pressable key={st.title} accessibilityRole="button" accessibilityState={{ selected: here }} onPress={() => { setStepsOpen(false); go(i); }}
            className={cn("min-h-14 flex-row items-center gap-3 rounded-lg px-3 active:bg-muted/50", here && "bg-muted")}>
            <StatusMark done={stepsDone[i]!} current={here} />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-base font-medium"><Text className="text-muted-foreground">{i + 1}</Text> {tr(st.title)}</Text>
              <Text numberOfLines={1} className="text-xs text-muted-foreground">
                {learnedHere.total ? tr("{0} / {1} learned", { 0: learnedHere.learned, 1: plural(learnedHere.total, "alg") }) : st.missing ? tr("Algorithms to come") : stepMastered(st, entry) ? tr("Mastered") : tr("Intuitive")}
              </Text>
            </View>
          </Pressable>;
        })}
    </Sheet>
    <AlgPlayerSheet items={playable.map(item => item.play!)} index={playing} onIndex={setPlaying} onClose={() => setPlaying(null)} />
    <CaseSheet caseId={caseOpen} ids={caseIds} onChange={setCaseOpen} onClose={() => setCaseOpen(null)} />
  </Page>;
}

/** A course completed: what was done, then where to go from here. */
function Finished({ puzzle, method, onTimer, onMethods }: { puzzle: PuzzleId; method: SolvingMethod; onTimer: () => void; onMethods: () => void }) {
  const cases = useAtomValue(casesAtom), learnedIds = useAtomValue(learnedCaseIdsAtom), progress = useAtomValue(courseProgressAtom);
  const { learned, total } = useMemo(() => {
    const marks = new Set(learnedIds), entry = courseEntry(progress, puzzle, method.id);
    return method.steps.reduce((sum, st) => { const c = stepLearned(st, cases, marks, entry); return { learned: sum.learned + c.learned, total: sum.total + c.total }; }, { learned: 0, total: 0 });
  }, [cases, learnedIds, progress, puzzle, method]);
  return <ScrollView className="flex-1" contentContainerClassName="flex-grow justify-center gap-6 px-5 py-8">
    <View className="size-12 items-center justify-center rounded-full bg-success/15">
      <Icon as={Check} size={24} strokeWidth={3} className="text-success" />
    </View>
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-xl font-semibold tracking-tight">{tr("{0} done", { 0: tr(method.name) })}</Text>
      <Text className="text-base text-muted-foreground">{tr("You have been through every step of {0}. Solve with it on the timer until it flows, then try a faster method.", { 0: tr(method.name) })}</Text>
    </View>
    <View className="flex-row gap-10">
      <Figure label={tr("Steps")} value={`${method.steps.length} / ${method.steps.length}`} size="lg" tone="good" />
      {total > 0 && <Figure label={tr("Algorithms learned")} value={`${learned} / ${total}`} size="lg" />}
    </View>
    <View className="gap-2">
      <Button size="lg" className="h-12 gap-2 rounded-xl" onPress={onTimer}>
        <Icon as={Timer} size={17} className="text-primary-foreground" />
        <Text className="text-base font-semibold">{tr("Practise with the timer")}</Text>
      </Button>
      <Button size="lg" variant="outline" className="h-12 gap-2 rounded-xl" onPress={onMethods}>
        <Icon as={GraduationCap} size={17} className="text-foreground" />
        <Text className="text-base font-medium">{tr("Learn another method")}</Text>
      </Button>
    </View>
  </ScrollView>;
}
