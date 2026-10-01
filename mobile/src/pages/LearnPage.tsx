import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { BookA, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Flag, GraduationCap, Info, Play, Timer } from "lucide-react-native";
import { memo, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import {
  LEVEL_LABEL, algId, algSetup, completeStep, courseEntry, finishCourse, firstOpenSet, goToStep, methodFacts, methodOf, methodProgress, openCourse,
  recommendedMethod, setGroups, stepId, stepLearned, stepSets, toggleAlgLearned, type CourseEntry,
} from "../../../src/client/lib/course";
import { plural } from "../../../src/client/lib/format";
import { applyAlg, solved } from "../../../src/shared/cube";
import { viewForMask } from "../../../src/shared/cubeDiagram";
import { METHODS, type MethodAlgorithm, type MethodLevel, type MethodStep, type SolvingMethod } from "../../../src/shared/methods";
import { puzzleInfo, type PuzzleId } from "../../../src/shared/puzzles";
import type { CaseDto } from "../../../src/shared/types";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { CaseDiagram } from "../components/CaseDiagram";
import { Alg, BackButton, Bar, Choice, Label, Numeric, Page, PageHead, Surface } from "../components/layout";
import { PuzzleIcon, SessionButton } from "../components/PuzzlePicker";
import { Sheet } from "../components/Sheet";
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { displayAlg, maskForStage, shortId } from "../lib/caseState";
import { AlgPlayerSheet, type PlayItem } from "../components/AlgPlayer";
import {
  casesAtom, courseProgressAtom, goBackAtom, learnMethodAtom, learnedCaseIdsAtom, notationAtom, previousRouteAtom, puzzleAtom, replaceRouteAtom, routeAtom,
  selectedCaseIdsAtom, setsAtom,
} from "../state";

/**
 * Learn, as the web app on a phone: the puzzle's methods as large rows, then the chosen one as a course, its steps in a
 * sheet, the current step's explanation, tips and algorithms, and Previous, Train, Done and Next under the thumb.
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
  return <View accessibilityLabel={LEVEL_LABEL[level]} className="h-3.5 flex-row items-end gap-[3px]">
    {["h-1.5", "h-2.5", "h-3.5"].map((height, i) =>
      <View key={height} className={cn("w-[3px] rounded-[1px]", height, on ? "bg-primary" : "bg-muted-foreground", i >= lit && "opacity-25")} />)}
  </View>;
}

/** Where a step stands, as a passive mark: a green disc with a check once done, a ring around a dot for the step shown, a dashed circle before. */
function StatusMark({ done, current = false }: { done: boolean; current?: boolean }) {
  return <View className="size-5 items-center justify-center" accessibilityLabel={done ? "Done" : current ? "Current step" : "To do"}>
    {done ? <View className="size-4 items-center justify-center rounded-full bg-success">
      <Icon as={Check} size={12} strokeWidth={3} className="text-background" />
    </View> : current ? <View className="size-4 items-center justify-center rounded-full border-[1.5px] border-primary">
      <View className="size-1.5 rounded-full bg-primary" />
    </View> : <View className="size-4 rounded-full border-[1.5px] border-dashed border-muted-foreground/50" />}
  </View>;
}

function Methods({ puzzle }: { puzzle: PuzzleId }) {
  const cases = useAtomValue(casesAtom);
  const [progress, setProgress] = useAtom(courseProgressAtom);
  const setRoute = useSetAtom(routeAtom);
  const recommended = recommendedMethod(puzzle);
  const open = (id: string) => { setProgress(openCourse(progress, puzzle, id)); setRoute({ page: "learn", method: id }); };
  return <Page>
    <PageHead title="Learn"><SessionButton /></PageHead>
    <Text className="-mt-1 text-sm text-muted-foreground">Choose a {puzzleInfo(puzzle).label} method, then follow it step by step.</Text>
    <ScrollView className="-mx-4 flex-1" contentContainerClassName="px-4 pb-4">
      <Surface>
        {METHODS[puzzle].map((method, i) => {
          const facts = methodFacts(method, cases), state = methodProgress(progress, puzzle, method), isRecommended = method.id === recommended;
          return <Pressable key={method.id} accessibilityRole="button" accessibilityLabel={`${state.started ? "Continue" : "Start"} ${method.name}`} onPress={() => open(method.id)}
            className={cn("min-h-16 flex-row items-start gap-3 px-4 py-3.5 active:bg-muted/50", i > 0 && "border-t border-border")}>
            <View className={cn("size-9 items-center justify-center rounded-lg", isRecommended || state.started ? "bg-primary/15" : "bg-muted")}>
              <LevelBars level={method.level} on={isRecommended || state.started} />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <View className="flex-row items-baseline gap-2">
                <Text numberOfLines={1} className="shrink text-[15px] font-medium">{method.name}</Text>
                <Text className={cn("text-xs", isRecommended ? "text-primary" : "text-muted-foreground")}>{isRecommended ? "Recommended" : LEVEL_LABEL[method.level]}</Text>
              </View>
              <Text numberOfLines={1} className="text-xs text-muted-foreground">
                {plural(facts.steps, "step")} · {plural(facts.algorithms, "alg")}{state.started ? ` · ${state.done} / ${state.total} done` : ""}
              </Text>
              <Text numberOfLines={2} className="text-[13px] leading-[18px] text-muted-foreground">{method.summary}</Text>
              {state.started && <Bar ratio={state.done / state.total} className="mt-1 max-w-48" />}
            </View>
            <View className="flex-row items-center gap-0.5 self-center">
              <Text className="text-sm font-medium text-primary">{state.started ? "Continue" : "Start"}</Text>
              <Icon as={ChevronRight} size={16} className="text-primary" />
            </View>
          </Pressable>;
        })}
      </Surface>
    </ScrollView>
  </Page>;
}

/** One algorithm of a step, from the catalogue or the step's own. */
type Item = { key: string; name: string; detail?: string; alg: string; alternatives: string[]; note?: string; learned: boolean; c?: CaseDto; own?: { step: MethodStep; alg: MethodAlgorithm }; play?: PlayItem };
type Row = { kind: "group"; key: string; label: string } | { kind: "alg"; key: string; item: Item };

function catalogItem(c: CaseDto, learned: boolean, puzzle: PuzzleId, context: string): Item {
  // The 3×3 cases go by their number (OLL 21 → 21, its name beside); the other puzzles' by their name.
  const name = c.puzzle_id || c.cube_size ? c.name : shortId(c), algs = c.algorithms.map(displayAlg);
  const detail = c.name !== c.id && c.name !== name ? c.name : undefined, size = c.diagram ? null : (c.cube_size ?? puzzleInfo(puzzle).cubeSize);
  return {
    key: c.id, name, detail, alg: algs[0]!, alternatives: algs.slice(1), note: c.notes, learned, c,
    play: size ? { key: c.id, name, detail, context, algs, note: c.notes, size, mask: maskForStage(c.stage) } : undefined,
  };
}

/** The case an inline algorithm solves, drawn like the catalogue's diagrams; puzzles without one keep their glyph. */
function InlineDiagram({ puzzle, step, alg, size }: { puzzle: PuzzleId; step: MethodStep; alg: MethodAlgorithm; size: number }) {
  const cube = puzzleInfo(puzzle).cubeSize, mask = step.mask ?? "full";
  const state = useMemo(() => cube ? applyAlg(solved(cube), algSetup(alg)) : null, [cube, alg]);
  if (!state) return <View className="items-center justify-center opacity-60" style={{ width: size, height: size }}><PuzzleIcon puzzle={puzzle} size={size * 0.5} /></View>;
  return <StaticCubeSvg state={state} size={size} mask={mask} view={viewForMask(mask)} />;
}

/** Whether an algorithm is learned, as a labelled toggle: "Mark learned", then "Learned" in green. */
function LearnToggle({ item, onToggle }: { item: Item; onToggle: (item: Item) => void }) {
  return <Pressable onPress={() => onToggle(item)} accessibilityRole="switch" accessibilityState={{ checked: item.learned }} accessibilityLabel={item.learned ? `${item.name} learned` : `Mark ${item.name} learned`}
    className={cn("h-11 flex-row items-center gap-1.5 self-start rounded-lg border px-3", item.learned ? "border-success/40 bg-success/15 active:bg-success/25" : "border-border active:bg-muted/60")}>
    <Icon as={Check} size={15} className={item.learned ? "text-success" : "text-muted-foreground"} />
    <Text className={cn("font-sans text-sm font-medium", item.learned ? "text-success" : "text-muted-foreground")}>{item.learned ? "Learned" : "Mark learned"}</Text>
  </Pressable>;
}

/** One algorithm: its case (a tap plays it in 3D), its name, the algorithm, how to hold the cube, its alternatives, then its learned toggle. */
const AlgRow = memo(function AlgRow({ item, puzzle, onToggle, onPlay }: { item: Item; puzzle: PuzzleId; onToggle: (item: Item) => void; onPlay: (item: Item) => void }) {
  const [open, setOpen] = useState(false);
  const diagram = item.c ? <CaseDiagram c={item.c} size={56} /> : <InlineDiagram puzzle={puzzle} step={item.own!.step} alg={item.own!.alg} size={56} />;
  return <View className="flex-row items-center gap-5 py-2.5">
    {item.play ? <Pressable onPress={() => onPlay(item)} accessibilityRole="button" accessibilityLabel={`Play ${item.name} in 3D`} className="rounded-md active:opacity-70">
      {diagram}
      <View className="absolute -right-1 -bottom-1 size-5 items-center justify-center rounded-full border border-border bg-background">
        <Icon as={Play} size={10} className="text-muted-foreground" fill="currentColor" />
      </View>
    </Pressable> : diagram}
    <View className="min-w-0 flex-1 gap-1.5">
      <View className="flex-row items-baseline gap-2">
        <Text numberOfLines={1} className="shrink text-sm font-medium">{item.name}</Text>
        {item.detail ? <Text numberOfLines={1} className="shrink text-xs text-muted-foreground">{item.detail}</Text> : null}
      </View>
      <Alg text={item.alg} size={16} selectable />
      {item.note ? <Text className="text-xs leading-[18px] text-muted-foreground">{item.note}</Text> : null}
      {item.alternatives.length > 0 && <View className="gap-1.5">
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} className="-ml-1 min-h-9 flex-row items-center gap-1 self-start rounded-md px-1 active:bg-muted/50">
          <Icon as={open ? ChevronDown : ChevronRight} size={14} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">{plural(item.alternatives.length, "alternative")}</Text>
        </Pressable>
        {open && item.alternatives.map((alt, i) => <Alg key={i} text={alt} size={14} className="opacity-70" selectable />)}
      </View>}
      <View className="items-end pt-1"><LearnToggle item={item} onToggle={onToggle} /></View>
    </View>
  </View>;
});

function Course({ puzzle, method }: { puzzle: PuzzleId; method: SolvingMethod }) {
  const [progress, setProgress] = useAtom(courseProgressAtom);
  const cases = useAtomValue(casesAtom), sets = useAtomValue(setsAtom);
  const [learnedIds, toggleLearned] = useAtom(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const previousRoute = useAtomValue(previousRouteAtom);
  const goBack = useSetAtom(goBackAtom), replaceRoute = useSetAtom(replaceRouteAtom), setRoute = useSetAtom(routeAtom), setSelection = useSetAtom(selectedCaseIdsAtom);
  const openNotation = useSetAtom(notationAtom);
  const [chosenSets, setChosenSets] = useState<Record<number, string>>({});
  const [stepsOpen, setStepsOpen] = useState(false);
  // The course just finished: the page says so until a step is opened again.
  const [finished, setFinished] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const entry: CourseEntry = courseEntry(progress, puzzle, method.id);
  const step = method.steps[entry.step]!;
  const done = entry.done.includes(stepId(step));
  const state = methodProgress(progress, puzzle, method);
  const own = stepSets(step, sets, puzzle);
  const chosen = own.find(s => s.id === chosenSets[entry.step]) ?? firstOpenSet(own, cases, learned);
  const count = stepLearned(step, cases, learned, entry);
  const last = entry.step === method.steps.length - 1, next = method.steps[entry.step + 1];
  const rows = useMemo(() => {
    const size = puzzleInfo(puzzle).cubeSize;
    const result: Row[] = (step.algs ?? []).map(alg => {
      const id = algId(step, alg), algs = [alg.alg, ...(alg.alternatives ?? [])];
      return { kind: "alg", key: id, item: {
        key: id, name: alg.name, detail: alg.detail, alg: alg.alg, alternatives: alg.alternatives ?? [], note: alg.note, learned: entry.learned.includes(id), own: { step, alg },
        play: size ? { key: id, name: alg.name, detail: alg.detail, context: step.title, algs, note: alg.note, size, mask: step.mask ?? "full", setup: alg.setup } : undefined,
      } };
    });
    if (chosen) {
      const groups = setGroups(cases, chosen.id);
      for (const [group, members] of groups) {
        if (groups.length > 1 || own.length === 1) result.push({ kind: "group", key: `group:${group}`, label: groups.length > 1 ? group : chosen.label });
        const context = [chosen.label, groups.length > 1 && group].filter(Boolean).join(" · ");
        for (const c of members) result.push({ kind: "alg", key: c.id, item: catalogItem(c, learned.has(c.id), puzzle, context) });
      }
    }
    return result;
  }, [puzzle, step, chosen, cases, learned, entry.learned, own.length]);
  // The algorithms the 3D player steps through: the step's, in the list's order.
  const playable = useMemo(() => rows.flatMap(row => row.kind === "alg" && row.item.play ? [row.item] : []), [rows]);
  const back = () => {
    if (previousRoute?.page === "learn" && !previousRoute.method) goBack();
    else replaceRoute({ page: "learn" });
  };
  const go = (index: number) => { setFinished(false); setProgress(goToStep(progress, puzzle, method.id, index)); };
  const toggle = (item: Item) => {
    if (item.c) toggleLearned(item.c.id);
    else setProgress(toggleAlgLearned(progress, puzzle, method.id, item.key));
  };
  const play = (item: Item) => setPlaying(playable.indexOf(item));
  const train = () => {
    if (!chosen) return;
    setSelection(cases.filter(c => c.set === chosen.id).map(c => c.id));
    setRoute({ page: "training", autostart: true });
  };
  const header = <View className="gap-4 pb-2">
    <Text className="text-[15px] leading-[23px] text-foreground/85">{step.text}</Text>
    {step.tips?.length ? <View className="gap-1.5">
      <Label>Tips</Label>
      {step.tips.map(tip => <View key={tip} className="flex-row gap-2.5">
        <View className="mt-2 size-1 rounded-full bg-muted-foreground/60" />
        <Text className="min-w-0 flex-1 text-sm leading-[20px] text-muted-foreground">{tip}</Text>
      </View>)}
    </View> : null}
    {step.missing ? <View className="flex-row gap-2">
      <Icon as={Info} size={16} className="mt-0.5 text-muted-foreground" />
      <Text className="min-w-0 flex-1 text-sm leading-[20px] text-muted-foreground">{step.missing}</Text>
    </View> : null}
    {count.total > 0 && <View className="gap-2 pt-1">
      <View className="flex-row items-center justify-between gap-3">
        <Label>Algorithms <Numeric className="text-xs text-muted-foreground">{count.learned} / {count.total} learned</Numeric></Label>
        <Pressable accessibilityRole="button" accessibilityLabel="Notation" onPress={() => openNotation(true)} className="-mr-2 h-9 flex-row items-center gap-1 rounded-md px-2 active:bg-muted/50">
          <Icon as={BookA} size={14} className="text-muted-foreground" />
          <Text className="text-xs text-muted-foreground">Notation</Text>
        </Pressable>
      </View>
      {own.length > 1 && chosen && <Choice label="Set" value={chosen.id} onChange={id => setChosenSets(previous => ({ ...previous, [entry.step]: id }))}
        options={own.map(s => ({ id: s.id, label: s.label, count: s.count }))} />}
    </View>}
  </View>;
  return <Page>
    <PageHead lead={<BackButton label="Every method" onPress={back} />} title={method.name} sub={`${puzzleInfo(puzzle).label} · ${state.done} of ${state.total} steps done`} />
    <Surface className="flex-1">
      <Pressable accessibilityRole="button" accessibilityLabel={finished ? `${method.name} done. Every step` : `Step ${entry.step + 1} of ${method.steps.length}: ${step.title}. Every step`} onPress={() => setStepsOpen(true)}
        className="min-h-14 flex-row items-center gap-3 border-b border-border px-4 active:bg-muted/50">
        <StatusMark done={finished || done} current={!finished && !done} />
        <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
          <Text numberOfLines={1} className="min-w-0 flex-1 font-sans text-[15px] font-medium">{finished ? `${method.name} done` : step.title}</Text>
          <Text className="font-sans text-xs text-muted-foreground">{finished ? method.steps.length : entry.step + 1} / {method.steps.length}</Text>
        </View>
        <Icon as={ChevronsUpDown} size={16} className="text-muted-foreground" />
      </Pressable>
      {finished ? <Finished puzzle={puzzle} method={method} onTimer={() => setRoute({ page: "playground" })} onMethods={back} /> : <>
        <FlatList key={`${entry.step}:${chosen?.id ?? ""}`} data={rows} keyExtractor={row => row.key} ListHeaderComponent={header}
          renderItem={({ item: row }) => row.kind === "group"
            ? <Label className="pt-3 pb-1">{row.label}</Label>
            : <AlgRow item={row.item} puzzle={puzzle} onToggle={toggle} onPlay={play} />}
          initialNumToRender={10} maxToRenderPerBatch={8} windowSize={7}
          className="flex-1" contentContainerClassName="px-4 pt-4 pb-6" />
        <View className="flex-row items-center gap-1 border-t border-border bg-muted/30 px-2 py-2">
          <Pressable accessibilityRole="button" accessibilityLabel="Previous step" disabled={entry.step === 0} onPress={() => go(entry.step - 1)}
            className={cn("h-12 flex-row items-center gap-1 rounded-lg px-3 active:bg-muted/60", entry.step === 0 && "opacity-40")}>
            <Icon as={ChevronLeft} size={18} className="text-muted-foreground" />
            <Text className="text-sm font-medium text-muted-foreground">Previous</Text>
          </Pressable>
          {chosen && <Pressable accessibilityRole="button" accessibilityLabel={`Train ${chosen.label}`} onPress={train} className="h-12 flex-row items-center gap-1.5 rounded-lg px-3 active:bg-muted/60">
            <Icon as={Timer} size={17} className="text-muted-foreground" />
            <Text className="text-sm font-medium text-muted-foreground">Train</Text>
          </Pressable>}
          {last
            ? <Pressable accessibilityRole="button" accessibilityLabel="Finish" onPress={() => { setProgress(finishCourse(progress, puzzle, method.id)); setFinished(true); }}
              className="h-12 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-3 active:bg-primary/85">
              <Icon as={Flag} size={17} className="text-primary-foreground" />
              <Text className="text-[15px] font-semibold text-primary-foreground">Finish</Text>
            </Pressable>
            : <Pressable accessibilityRole="button" accessibilityLabel={`Next step: ${next!.title}`} onPress={() => setProgress(completeStep(progress, puzzle, method.id, entry.step))}
              className="h-12 min-w-0 flex-1 flex-row items-center gap-2 rounded-lg bg-primary pr-2 pl-3 active:bg-primary/85">
              <Text numberOfLines={1} className="min-w-0 flex-1 font-sans text-sm font-semibold text-primary-foreground">Next · {next!.title}</Text>
              <Icon as={ChevronRight} size={18} className="text-primary-foreground" />
            </Pressable>}
        </View>
      </>}
    </Surface>
    <Sheet open={stepsOpen} onClose={() => setStepsOpen(false)} title="Steps" description={`${state.done} of ${state.total} done`} scroll contentClassName="gap-0 px-2">
        {method.steps.map((st, i) => {
          const learnedHere = stepLearned(st, cases, learned, entry), here = i === entry.step && !finished;
          return <Pressable key={st.title} accessibilityRole="button" accessibilityState={{ selected: here }} onPress={() => { setStepsOpen(false); go(i); }}
            className={cn("min-h-14 flex-row items-center gap-3 rounded-lg px-3 active:bg-muted/50", here && "bg-muted")}>
            <StatusMark done={entry.done.includes(stepId(st))} current={here} />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-[15px] font-medium"><Text className="text-muted-foreground">{i + 1}</Text> {st.title}</Text>
              <Text numberOfLines={1} className="text-xs text-muted-foreground">
                {learnedHere.total ? `${learnedHere.learned} / ${plural(learnedHere.total, "alg")} learned` : st.missing ? "Algorithms to come" : "Intuitive"}
              </Text>
            </View>
          </Pressable>;
        })}
    </Sheet>
    <AlgPlayerSheet items={playable.map(item => item.play!)} index={playing} onIndex={setPlaying} onClose={() => setPlaying(null)} />
  </Page>;
}

/** A course completed: what was done, then where to go from here. */
function Finished({ puzzle, method, onTimer, onMethods }: { puzzle: PuzzleId; method: SolvingMethod; onTimer: () => void; onMethods: () => void }) {
  return <ScrollView className="flex-1" contentContainerClassName="flex-grow justify-center gap-6 px-5 py-8">
    <View className="size-12 items-center justify-center rounded-full bg-success/15">
      <Icon as={Check} size={24} strokeWidth={3} className="text-success" />
    </View>
    <View className="gap-2">
      <Label>{puzzleInfo(puzzle).label} · {LEVEL_LABEL[method.level]}</Label>
      <Text accessibilityRole="header" className="text-2xl font-semibold tracking-tight">{method.name} done</Text>
      <Text className="text-[15px] leading-[23px] text-muted-foreground">You have been through every step of {method.name}. Solve with it on the timer until it flows, then try a faster method.</Text>
    </View>
    <View className="gap-2">
      <Pressable accessibilityRole="button" onPress={onTimer} className="h-12 flex-row items-center justify-center gap-2 rounded-lg bg-primary active:bg-primary/85">
        <Icon as={Timer} size={17} className="text-primary-foreground" />
        <Text className="text-[15px] font-semibold text-primary-foreground">Practise with the timer</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onMethods} className="h-12 flex-row items-center justify-center gap-2 rounded-lg border border-border active:bg-muted/60">
        <Icon as={GraduationCap} size={17} className="text-foreground" />
        <Text className="text-[15px] font-medium">Learn another method</Text>
      </Pressable>
    </View>
  </ScrollView>;
}
