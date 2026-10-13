import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { BookA, Box, Check, ChevronLeft, ChevronRight, CircleHelp, Dumbbell, Eye, EyeOff, Flag, GraduationCap, Info, ListFilter, Play, Timer, type LucideIcon } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import {
  LEVEL_LABEL, algId, algSetup, courseEntry, firstOpenSet, goToStep, methodFacts, methodLearned, methodOf, methodProgress, methodShare, openCourse,
  recommendedMethod, setGroups, stepDone, stepId, stepLearned, stepMastered, stepPicture, stepSets, toggleAlgLearned, type CourseEntry, type CourseProgress,
} from "../../../src/client/lib/course";
import { caseTitle, moveCount } from "../../../src/client/lib/caseState";
import { assisted } from "../../../src/client/lib/methodSolver";
import { isLearningTrack, orderedGroups } from "../../../src/client/lib/dailyLearning";
import { plural } from "../../../src/client/lib/format";
import { applyAlg, solved } from "../../../src/shared/cube";
import { viewForMask, type CubeMask } from "../../../src/shared/cubeDiagram";
import { METHODS, type MethodAlgorithm, type MethodLevel, type MethodStep, type SolvingMethod } from "../../../src/shared/methods";
import { puzzleInfo, type PuzzleId } from "../../../src/shared/puzzles";
import type { CaseDto } from "../../../src/shared/types";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, local } from "../api";
import { Alg, Bar, Empty, Figure, HeadButton, IconTile, Numeric, Segmented } from "../components/layout";
import { AppBar, PushedBar, SectionTabs } from "../components/AppBar";
import { Chip, ChipMenu } from "../components/Chips";
import { PuzzleIcon } from "../components/PuzzlePicker";
import { Sheet } from "../components/Sheet";
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { CaseDiagram } from "../components/CaseDiagram";
import { AlgPlayerSheet, type PlayItem } from "../components/AlgPlayer";
import { isPolyPuzzle } from "../../../src/shared/puzzleScene";
import { CaseSheet } from "./AlgorithmsPage";
import { useLayout } from "../hooks/useLayout";
import { useTourTarget } from "../tour";
import { unlockPuzzleAtom } from "../journey";
import { storage } from "../platform/storage";
import { useColors } from "../theme";
import {
  casesAtom, courseProgressAtom, goBackAtom, guidesAtom, learnMethodAtom, learnedCaseIdsAtom, learningFilterAtom, notationAtom, previousRouteAtom, puzzleAtom,
  replaceRouteAtom, routeAtom, selectedCaseIdsAtom, setsAtom, statsVersionAtom, trainingRunAtom, trainingSetupModeAtom, trainingStepAtom,
} from "../state";
import { said, tr } from "../../../src/client/i18n";

/**
 * Learn, direction A: the Courses tab shows the course to carry on, large, then every method of the puzzle as a row
 * with its share known; a method opens its course as a pushed screen, its steps as ring chips on one sliding line,
 * the step's workbench (one case at a time) and Previous / Next step at the bottom. The route is passed in rather than
 * read, so a page sliding out keeps showing what it showed.
 */
export function LearnPage({ method: methodId }: { method?: string }) {
  const puzzle = useAtomValue(puzzleAtom);
  const method = methodOf(puzzle, methodId);
  const setLearnMethod = useSetAtom(learnMethodAtom);
  useEffect(() => { setLearnMethod(method?.id); }, [method?.id, setLearnMethod]);
  return method ? <Course key={`${puzzle}:${method.id}`} puzzle={puzzle} method={method} /> : <Methods puzzle={puzzle} />;
}

/** On a tablet: a panel docked at the right of the page (wide), or peeking above the bottom bar (portrait). */
const DOCKED = "m-3 ml-0 w-[380px] gap-3 rounded-[26px] border border-border bg-card p-4";
const PEEK = "mb-2 w-full max-w-[620px] gap-3 self-center rounded-[22px] border border-border bg-popover p-4";
/** A list two by two, for a grid of two columns. */
const pairs = <T,>(list: T[]) => Array.from({ length: Math.ceil(list.length / 2) }, (_, i) => list.slice(i * 2, i * 2 + 2));

/** A method's level as three rising bars: one lit for a first method, all three for a top-level one. */
function LevelBars({ level, on }: { level: MethodLevel; on: boolean }) {
  const lit = { beginner: 1, intermediate: 2, advanced: 3 }[level];
  return <View accessibilityLabel={tr(LEVEL_LABEL[level])} className="h-3.5 flex-row items-end gap-[3px]">
    {["h-1.5", "h-2.5", "h-3.5"].map((height, i) =>
      <View key={height} className={cn("w-[3px] rounded-[1px]", height, on ? "bg-primary" : "bg-muted-foreground", i >= lit && "opacity-25")} />)}
  </View>;
}

/** What the list says about each method: its facts, its algorithms known and where its course stands. */
function methodRows(puzzle: PuzzleId, cases: CaseDto[], learned: ReadonlySet<string>, progress: CourseProgress) {
  const recommended = recommendedMethod(puzzle);
  return METHODS[puzzle].map(method => {
    const facts = methodFacts(method, cases);
    const known = methodLearned(method, cases, learned, courseEntry(progress, puzzle, method.id));
    return {
      method, facts, known, share: methodShare(method, cases, learned, progress, puzzle), state: methodProgress(progress, puzzle, method, cases, learned),
      recommended: method.id === recommended, percent: facts.algorithms ? Math.round(known / facts.algorithms * 100) : 0,
    };
  });
}
type MethodRow = ReturnType<typeof methodRows>[number];

/** The Courses tab: the course to carry on (the one opened last if under way, else one under way, else the recommended), then every method. */
function Methods({ puzzle }: { puzzle: PuzzleId }) {
  const cases = useAtomValue(casesAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const [progress, setProgress] = useAtom(courseProgressAtom);
  const setRoute = useSetAtom(routeAtom), openGuide = useSetAtom(guidesAtom);
  const rows = useMemo(() => methodRows(puzzle, cases, learned, progress), [puzzle, cases, learned, progress]);
  const last = progress.methods[puzzle];
  const hero = rows.find(r => r.method.id === last && r.state.started && !r.state.learned) ?? rows.find(r => r.state.started && !r.state.learned) ?? rows.find(r => r.recommended) ?? rows[0];
  const open = (id: string, step?: number) => {
    const opened = openCourse(progress, puzzle, id);
    setProgress(step === undefined ? opened : goToStep(opened, puzzle, id, step)); setRoute({ page: "learn", method: id });
  };
  const list = useTourTarget("learn");
  const { tablet, wide } = useLayout();
  // A tablet: the methods as large cards two by two, the course to carry on peeking above the bar, or docked beside them when wide.
  if (tablet) return <View className="flex-1 flex-row">
    <View className="min-w-0 flex-1">
      <AppBar><HeadButton icon={CircleHelp} label={tr("Help")} onPress={() => openGuide("methods")} /></AppBar>
      <SectionTabs />
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-3.5 px-7 pt-3.5 pb-3" showsVerticalScrollIndicator={false}>
        <View {...list} accessibilityLabel={tr("Methods")} className="gap-3.5">
          {pairs(rows).map(pair => <View key={pair[0]!.method.id} className="flex-row gap-3.5">
            {pair.map(row => <MethodCard key={row.method.id} puzzle={puzzle} row={row} compact={wide} onPress={() => open(row.method.id)} />)}
            {pair.length < 2 && <View className="flex-1" />}
          </View>)}
        </View>
      </ScrollView>
      {!wide && hero && <View className={PEEK}><HeroCourse puzzle={puzzle} row={hero} onOpen={() => open(hero.method.id)} variant="peek" /></View>}
    </View>
    {wide && hero && <View className={DOCKED}><HeroCourse puzzle={puzzle} row={hero} onOpen={() => open(hero.method.id)} onStep={i => open(hero.method.id, i)} variant="side" /></View>}
  </View>;
  return <View className="flex-1">
    <AppBar><HeadButton icon={CircleHelp} label={tr("Help")} onPress={() => openGuide("methods")} /></AppBar>
    <SectionTabs />
    <View className="min-h-0 flex-1 gap-2.5 px-4 pt-3">
      {hero && <HeroCourse puzzle={puzzle} row={hero} onOpen={() => open(hero.method.id)} />}
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-2 pb-3" showsVerticalScrollIndicator={false}>
        <View {...list} accessibilityLabel={tr("Methods")} className="gap-2">
          {rows.map(row => <MethodTile key={row.method.id} row={row} onPress={() => open(row.method.id)} />)}
        </View>
      </ScrollView>
    </View>
  </View>;
}

/** A small figure on a quiet well, its dot in its colour. */
function Well({ label, value, dot, muted = false }: { label: string; value: string; dot: string; muted?: boolean }) {
  return <View className={cn("min-w-0 flex-1 gap-0.5 rounded-xl bg-card px-2.5 py-1.5", muted && "bg-muted")}>
    <View className="flex-row items-center gap-1"><View className={cn("size-1.5 rounded-full", dot)} /><Text numberOfLines={1} className="text-xs text-muted-foreground">{label}</Text></View>
    <Numeric numberOfLines={1} className="text-base font-extrabold tracking-tight">{value}</Numeric>
  </View>;
}

/** Each step of a method with its algorithms learned and whether it is done. */
function useStepCounts(puzzle: PuzzleId, method: SolvingMethod) {
  const cases = useAtomValue(casesAtom), learnedIds = useAtomValue(learnedCaseIdsAtom), progress = useAtomValue(courseProgressAtom);
  return useMemo(() => {
    const learned = new Set(learnedIds), entry = courseEntry(progress, puzzle, method.id);
    return method.steps.map(st => ({ ...stepLearned(st, cases, learned, entry), done: stepDone(st, cases, learned, entry) }));
  }, [cases, learnedIds, progress, puzzle, method]);
}

/** A bar per step of a method, green once done; `here` outlines the current one. */
function StepBars({ puzzle, method, here, className }: { puzzle: PuzzleId; method: SolvingMethod; here?: number; className?: string }) {
  const counts = useStepCounts(puzzle, method);
  return <View className="flex-row gap-1" accessibilityLabel={tr("Steps")}>
    {method.steps.map((st, i) => {
      const count = counts[i]!;
      return <Bar key={st.title} ratio={count.done ? 1 : count.total ? count.learned / count.total : 0} fill={count.done ? "bg-success" : undefined}
        className={cn("h-1.5 min-w-0 flex-1", className, i === here && "border border-foreground/40")} />;
    })}
  </View>;
}

/**
 * The course to carry on: its name large, its line (three figures on a tablet), a bar per step, then Start or Continue. On a
 * tablet it `peek`s above the bottom bar (no line: the cards show it), or docks at the `side`, its steps as a list.
 */
function HeroCourse({ puzzle, row, onOpen, onStep, variant }: { puzzle: PuzzleId; row: MethodRow; onOpen: () => void; onStep?: (index: number) => void; variant?: "peek" | "side" }) {
  const counts = useStepCounts(puzzle, row.method);
  const colors = useColors();
  const { method, state } = row;
  const step = method.steps[state.step] ?? method.steps[0]!;
  // The button names the step it opens on.
  const action = state.started ? tr("Continue · {0}", { 0: tr(step.title) }) : tr("Start · {0}", { 0: tr(step.title) });
  const side = variant === "side";
  return <View className={cn("gap-2.5 rounded-3xl bg-muted p-4", variant === "peek" && "rounded-none bg-transparent p-0", side && "flex-1 rounded-none bg-transparent p-1")}>
    <View className="flex-row items-center gap-1.5">
      <LevelBars level={method.level} on={state.started || row.recommended} />
      <Text className={cn("text-sm font-bold", state.started || row.recommended ? "text-primary" : "text-muted-foreground")}>
        {row.recommended && !state.started ? tr("Start here") : tr(LEVEL_LABEL[method.level])}
      </Text>
    </View>
    <Text numberOfLines={1} className={cn("text-[30px] leading-[34px] font-extrabold tracking-[-0.04em]", side && "text-[40px] leading-[44px]")}>{tr(method.name)}</Text>
    {/* A phone leaves them out: the bars count the steps, the method's row under it its algorithms and share known. */}
    {variant && <View className="flex-row gap-1.5">
      <Well label={tr("Steps")} value={`${state.done} / ${state.total}`} dot="bg-success" muted />
      <Well label={tr("Algorithms")} value={`${row.known} / ${row.facts.algorithms}`} dot="bg-primary" muted />
      <Well label={tr("Known")} value={`${row.percent}%`} dot="bg-lilac" muted />
    </View>}
    {side ? <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-0.5" accessibilityLabel={tr("Steps")}>
      {method.steps.map((st, i) => {
        const count = counts[i]!, line = count.total ? `${count.learned} / ${count.total}` + (count.done ? ` · ${tr("Done")}` : "") : count.done ? tr("Done") : tr("Intuitive");
        return <Pressable key={st.title} accessibilityRole="button" accessibilityLabel={`${i + 1}. ${tr(st.title)} · ${line}`} onPress={() => onStep?.(i)}
          className={cn("min-h-12 flex-row items-center gap-3 rounded-xl px-2.5 py-1.5 active:bg-muted/70", i === state.step && "bg-muted")}>
          <Ring share={count.done ? 1 : count.total ? count.learned / count.total : 0} color={count.done ? colors.variables["--success"] ?? colors.primary : colors.primary} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-[15px] font-bold">{tr(st.title)}</Text>
            <Numeric numberOfLines={1} className={cn("text-xs text-muted-foreground", count.done && "text-success")}>{line}</Numeric>
          </View>
        </Pressable>;
      })}
    </ScrollView> : <StepBars puzzle={puzzle} method={method} here={state.step} className={variant ? undefined : "bg-card"} />}
    <Pressable accessibilityRole="button" accessibilityLabel={`${state.started ? tr("Continue") : tr("Start")} ${tr(method.name)}`} onPress={onOpen}
      className="h-12 flex-row items-center justify-between rounded-2xl bg-primary px-4 active:bg-primary/85">
      <Text numberOfLines={1} className="shrink text-base font-bold text-primary-foreground">{action}</Text>
      <Icon as={ChevronRight} size={18} className="text-primary-foreground" />
    </Pressable>
  </View>;
}

/** What a method's tile or card says beside its name: its badge, and its level and steps. */
function methodLabels({ method, state, share, recommended, facts }: MethodRow) {
  const done = share === 1;
  return {
    done, badge: done ? null : state.started ? tr("In progress") : recommended ? tr("Recommended") : null,
    detail: `${tr(LEVEL_LABEL[method.level])} · ${plural(facts.steps, "step")}`,
  };
}

/** A method's badge: in progress or recommended, or learned in green. */
function MethodBadge({ badge, done }: { badge: string | null; done: boolean }) {
  return <>
    {badge ? <Badge variant="accent"><Text className="text-xs font-semibold text-primary">{badge}</Text></Badge> : null}
    {done ? <Badge variant="success"><Icon as={Check} size={12} strokeWidth={3} className="text-success" /><Text className="text-xs font-semibold text-success">{tr("Learned")}</Text></Badge> : null}
  </>;
}

/** A method as a row: its level, name and badge, its line, then its share known large over the algorithms, and its bar. */
function MethodTile({ row, onPress }: { row: MethodRow; onPress: () => void }) {
  const { method, state } = row, { done, badge, detail } = methodLabels(row);
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${state.started ? tr("Continue") : tr("Start")} ${tr(method.name)}`}
    className="gap-2 rounded-2xl bg-card px-3.5 py-3 active:bg-muted/60">
    <View className="flex-row items-center gap-3">
      <View className={cn("size-10 items-center justify-center rounded-xl", row.recommended || state.started ? "bg-primary/15" : "bg-muted")}><LevelBars level={method.level} on={row.recommended || state.started} /></View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="shrink text-base font-extrabold tracking-tight">{tr(method.name)}</Text>
          <MethodBadge badge={badge} done={done} />
        </View>
        <Text numberOfLines={1} className="text-xs text-muted-foreground">{detail}</Text>
      </View>
      <View className="items-end">
        <Numeric className={cn("text-2xl font-extrabold tracking-tight", done ? "text-success" : row.percent ? "text-foreground" : "text-muted-foreground/50")}>{row.percent}%</Numeric>
        <Numeric className="text-xs text-muted-foreground">{tr("{0} / {1} algs", { 0: row.known, 1: row.facts.algorithms })}</Numeric>
      </View>
    </View>
    <Bar ratio={row.share} fill={done ? "bg-success" : undefined} />
  </Pressable>;
}

/**
 * A method as a tablet's card: its level and badge, its name large and its line; then a bar per step and its share
 * known large (portrait), or its share on one row over a single bar (`compact`, wide screens, where height is short).
 */
function MethodCard({ puzzle, row, compact, onPress }: { puzzle: PuzzleId; row: MethodRow; compact: boolean; onPress: () => void }) {
  const { method, state } = row, { done, badge, detail } = methodLabels(row);
  const tone = done ? "text-success" : row.percent ? "text-foreground" : "text-muted-foreground/50";
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${state.started ? tr("Continue") : tr("Start")} ${tr(method.name)}`}
    className={cn("min-w-0 flex-1 gap-2 rounded-3xl bg-card p-5 active:bg-muted/60", compact ? "gap-1.5 p-4" : "min-h-72")}>
    <View className="min-h-6 flex-row items-center gap-2">
      <LevelBars level={method.level} on={row.recommended || state.started} />
      <View className="flex-1" />
      <MethodBadge badge={badge} done={done} />
    </View>
    <Text numberOfLines={1} className="text-[26px] leading-8 font-extrabold tracking-[-0.04em]">{tr(method.name)}</Text>
    {compact ? <>
      <View className="flex-row items-baseline gap-2">
        <Text numberOfLines={1} className="min-w-0 flex-1 text-xs text-muted-foreground">{detail}</Text>
        <Numeric className="text-sm text-muted-foreground">{row.known} / {row.facts.algorithms}</Numeric>
        <Numeric className={cn("text-2xl font-extrabold tracking-tight", tone)}>{row.percent}%</Numeric>
      </View>
      <Bar ratio={row.share} fill={done ? "bg-success" : undefined} />
    </> : <>
      <View className="flex-1" />
      <Text numberOfLines={1} className="text-xs text-muted-foreground">{detail}</Text>
      <StepBars puzzle={puzzle} method={method} />
      <View className="flex-row items-baseline justify-between gap-2">
        <Numeric className={cn("text-[34px] leading-10 font-extrabold tracking-tight", tone)}>{row.percent}%</Numeric>
        <Numeric className="text-sm text-muted-foreground">{tr("{0} / {1} algs", { 0: row.known, 1: row.facts.algorithms })}</Numeric>
      </View>
    </>}
  </Pressable>;
}

/** A ring filled as far as `share` (0 to 1), in `color` over a faint track. */
function Ring({ share, color, size = 18 }: { share: number; color: string; size?: number }) {
  const r = (size - 4) / 2, length = 2 * Math.PI * r;
  return <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeOpacity={0.25} strokeWidth={2.5} fill="none" />
    {share > 0 && <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round"
      strokeDasharray={`${length * Math.min(1, share)} ${length}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
  </Svg>;
}

/** One thing to practise on a step's workbench: a catalogue case or one of the step's own algorithms. */
type Piece = {
  key: string; name: string; short?: string; sub?: string; note?: string;
  /** Its algorithms, the ones used first; `mine` those the player uses. */
  algs: string[]; mine: string[]; learned: boolean; group: string; c?: CaseDto; own?: MethodAlgorithm; play?: PlayItem;
};

/** The case an inline algorithm solves, drawn like the catalogue's diagrams; puzzles without one keep their glyph. */
function InlineDiagram({ puzzle, step, alg, size }: { puzzle: PuzzleId; step: MethodStep; alg: MethodAlgorithm; size: number }) {
  const cube = puzzleInfo(puzzle).cubeSize, mask = step.mask ?? "full";
  const state = useMemo(() => cube ? applyAlg(solved(cube), algSetup(alg)) : null, [cube, alg]);
  if (!state) return <View className="items-center justify-center opacity-60" style={{ width: size, height: size }}><PuzzleIcon puzzle={puzzle} size={size * 0.5} /></View>;
  return <StaticCubeSvg state={state} size={size} mask={mask} view={viewForMask(mask)} />;
}
function PieceDiagram({ piece, puzzle, step, size }: { piece: Piece; puzzle: PuzzleId; step: MethodStep; size: number }) {
  return piece.c ? <CaseDiagram c={piece.c} size={size} /> : <InlineDiagram puzzle={puzzle} step={step} alg={piece.own!} size={size} />;
}

/** The cube before or after a step, showing the pieces of its mask; other puzzles their glyph. */
function StepCube({ puzzle, setup, mask, size }: { puzzle: PuzzleId; setup: string; mask: CubeMask; size: number }) {
  const cube = puzzleInfo(puzzle).cubeSize;
  const state = useMemo(() => cube ? applyAlg(solved(cube), setup) : null, [cube, setup]);
  if (!state) return <View className="items-center justify-center" style={{ width: size, height: size }}><PuzzleIcon puzzle={puzzle} size={size * 0.6} /></View>;
  return <StaticCubeSvg state={state} size={size} mask={mask} view={viewForMask(mask)} />;
}

/** The set each step shows, kept for the session (the web's `learnSets`): learning its last case never switches to another set. */
const learnSetsAtom = atom<Record<string, string>>({});
/** The algorithms each learned case was learned with. */
const learnedAlgsAtom = atom(get => { get(statsVersionAtom); return local.learnedAlgs(); });
/** The order of the groups of the sets that are no learning track, set by set (a web preference). */
const GROUP_ORDER_KEY = "cubix.learn.groupOrder";
/** The order of a set's groups: a learning track's is its training's priority, any other set's a preference (web `groupOrder`). */
function groupOrder(setId: string): string[] | undefined {
  const track = setId.toUpperCase();
  if (isLearningTrack(track)) return local.learningGroupOrder()[track];
  try { return JSON.parse(storage.getItem(GROUP_ORDER_KEY) ?? "null")?.[setId]; } catch { return undefined; }
}

/**
 * A course, pushed from Courses: its steps as ring chips on one sliding line, then the step: an intuitive one shows its
 * sheet and its workbench as cards; one with algorithms its workbench, one case at a time with every case of the step
 * under it, the step's sheet behind the (i). Train, the timer and Previous / Next step stay at the bottom. On a tablet the
 * steps become the page's tabs and the workbench grows to two columns; when wide, the step's cases and its actions
 * dock at the right.
 */
function Course({ puzzle, method }: { puzzle: PuzzleId; method: SolvingMethod }) {
  const [progress, setProgress] = useAtom(courseProgressAtom);
  const unlock = useSetAtom(unlockPuzzleAtom);
  const cases = useAtomValue(casesAtom), sets = useAtomValue(setsAtom);
  const learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const previousRoute = useAtomValue(previousRouteAtom);
  const goBack = useSetAtom(goBackAtom), replaceRoute = useSetAtom(replaceRouteAtom), setRoute = useSetAtom(routeAtom), setSelection = useSetAtom(selectedCaseIdsAtom);
  const openGuide = useSetAtom(guidesAtom);
  const [learnSets, setLearnSets] = useAtom(learnSetsAtom);
  // The course just finished: the page says so until a step is opened again.
  const [finished, setFinished] = useState(false);
  const [about, setAbout] = useState(false);
  const entry: CourseEntry = courseEntry(progress, puzzle, method.id);
  const step = method.steps[entry.step]!;
  const own = stepSets(step, sets, puzzle);
  const setKey = `${puzzle}:${method.id}:${entry.step}`;
  const chosen = own.find(s => s.id === learnSets[setKey]) ?? firstOpenSet(own, cases, learned);
  useEffect(() => { if (chosen && !learnSets[setKey]) setLearnSets(previous => ({ ...previous, [setKey]: chosen.id })); }, [setKey, chosen?.id]);
  const count = stepLearned(step, cases, learned, entry);
  const hasPieces = count.total > 0;
  const learnedInSet = chosen ? cases.filter(c => c.set === chosen.id && learned.has(c.id)).length : 0;
  const next = method.steps[entry.step + 1];
  const back = () => {
    if (previousRoute?.page === "learn" && !previousRoute.method) goBack();
    else replaceRoute({ page: "learn" });
  };
  const go = (index: number) => { setFinished(false); setProgress(goToStep(progress, puzzle, method.id, index)); };
  const train = () => {
    if (!chosen) return;
    setSelection(cases.filter(c => c.set === chosen.id).map(c => c.id));
    setRoute({ page: "training", autostart: true });
  };
  const { tablet, wide } = useLayout();
  const stepNav = <>
    <Pressable accessibilityRole="button" accessibilityLabel={tr("Previous step")} disabled={entry.step === 0} onPress={() => go(entry.step - 1)}
      className={cn("size-11 items-center justify-center rounded-xl bg-muted active:bg-muted/70", entry.step === 0 && "opacity-40")}>
      <Icon as={ChevronLeft} size={20} />
    </Pressable>
    {next
      ? <Pressable accessibilityRole="button" accessibilityLabel={tr("Next step: {0}", { 0: tr(next.title) })} onPress={() => go(entry.step + 1)}
        className={cn("h-11 min-w-0 flex-1 flex-row items-center justify-between gap-2 rounded-xl pr-2.5 pl-4", hasPieces ? "bg-muted active:bg-muted/70" : "bg-primary active:bg-primary/85")}>
        <Text numberOfLines={1} className={cn("shrink text-[15px] font-bold", !hasPieces && "text-primary-foreground")}>{tr("Next")}</Text>
        <Icon as={ChevronRight} size={18} className={hasPieces ? "text-foreground" : "text-primary-foreground"} />
      </Pressable>
      : <Pressable accessibilityRole="button" accessibilityLabel={tr("Finish")} onPress={() => { void unlock(method.id); setFinished(true); }}
        className="h-11 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-3 active:bg-primary/85">
        <Icon as={Flag} size={17} className="text-primary-foreground" />
        <Text className="text-[15px] font-bold text-primary-foreground">{tr("Finish")}</Text>
      </Pressable>}
  </>;
  return <View className="flex-1">
    <PushedBar title={tr(method.name)} onBack={back}>
      {/* A 3×3 course can solve the player's own cube with them (AssistedPage), named rather than an icon to guess. */}
      {assisted(puzzle, method.id) && <Chip icon={Box} accessibilityLabel={tr("Assisted solve")} onPress={() => setRoute({ page: "assisted", method: method.id })}>{tr("With my cube")}</Chip>}
      {(hasPieces || !tablet) && !finished ? <HeadButton icon={Info} label={tr("About this step")} onPress={() => setAbout(true)} />
        : <HeadButton icon={CircleHelp} label={tr("Help")} onPress={() => openGuide("methods")} />}
    </PushedBar>
    <StepChips puzzle={puzzle} method={method} entry={entry} finished={finished} onPick={go} />
    {finished ? <Finished puzzle={puzzle} method={method} onTimer={() => setRoute({ page: "playground" })} onMethods={back} />
      : hasPieces ? <>
        <Workbench key={`${entry.step}:${chosen?.id ?? ""}`} puzzle={puzzle} method={method} entry={entry} chosen={chosen} own={own}
          onSet={id => setLearnSets(previous => ({ ...previous, [setKey]: id }))} onAbout={() => setAbout(true)}
          side={wide ? <>
            <View className="gap-1.5">
              {chosen && <SideAction icon={Dumbbell} label={tr("Train {0}", { 0: tr(chosen.label) })} disabled={!learnedInSet} onPress={train} />}
              <SideAction icon={Timer} label={tr("Practise with the timer")} onPress={() => setRoute({ page: "playground" })} />
            </View>
            <View className="flex-row items-center gap-1.5">{stepNav}</View>
          </> : undefined} />
        {!wide && <View className={cn("flex-row items-center gap-1.5 px-4 pt-1 pb-2", tablet && "px-7")}>
          {chosen && <HeadButton icon={Dumbbell} label={tr("Train {0}", { 0: tr(chosen.label) })} disabled={!learnedInSet} onPress={train} />}
          <HeadButton icon={Timer} label={tr("Practise with the timer")} onPress={() => setRoute({ page: "playground" })} />
          {stepNav}
        </View>}
      </>
      : tablet ? <IntuitiveStep puzzle={puzzle} method={method} entry={entry} wide={wide} nav={<View className="flex-row items-center gap-1.5">{stepNav}</View>} />
      : <>
        {/* A phone: the step's card (its tips in its sheet behind the (i)), its workbench kept above Previous / Next step. */}
        <ScrollView className="min-h-0 flex-1" contentContainerClassName="px-4 pb-2.5">
          <View className="gap-3 rounded-3xl bg-card p-4"><StepSheet puzzle={puzzle} method={method} entry={entry} /></View>
        </ScrollView>
        <View className="px-4"><IntuitiveBench puzzle={puzzle} method={method} entry={entry} bare /></View>
        <View className="flex-row items-center gap-1.5 px-4 pt-2.5 pb-2">{stepNav}</View>
      </>}
    <Sheet open={about} onClose={() => setAbout(false)} title={tr(step.title)} scroll>
      <StepSheet puzzle={puzzle} method={method} entry={entry} bare />
    </Sheet>
  </View>;
}

/** The course's steps as chips on one sliding line, each with a ring filled as far as its algorithms are learned (green once done). */
function StepChips({ puzzle, method, entry, finished, onPick }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry; finished: boolean; onPick: (index: number) => void }) {
  const cases = useAtomValue(casesAtom), learnedIds = useAtomValue(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const colors = useColors();
  const scroll = useRef<ScrollView>(null), offsets = useRef<number[]>([]);
  // A tablet shows them as the page's row of underlined tabs, each with its ring.
  const { tablet } = useLayout();
  useEffect(() => { scroll.current?.scrollTo({ x: Math.max(0, (offsets.current[entry.step] ?? 0) - (tablet ? 28 : 16)), animated: true }); }, [entry.step]);
  return <View className={tablet ? "border-b border-border" : "pb-2.5"}>
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerClassName={tablet ? "gap-6 px-7" : "gap-1.5 px-4"} accessibilityLabel={tr("Steps")}>
      {method.steps.map((st, i) => {
        const count = stepLearned(st, cases, learned, entry), done = finished || stepDone(st, cases, learned, entry), here = i === entry.step && !finished;
        const ringColor = done ? colors.variables["--success"] ?? colors.primary : colors.primary;
        return <Pressable key={st.title} onLayout={event => { offsets.current[i] = event.nativeEvent.layout.x; }} onPress={() => onPick(i)}
          accessibilityRole={tablet ? "tab" : "button"} accessibilityState={{ selected: here }} accessibilityLabel={`${i + 1}. ${tr(st.title)} · ${done ? tr("Done") : tr("To do")}`}
          className={tablet ? "h-12 flex-row items-center gap-2" : cn("h-10 flex-row items-center gap-2 rounded-full px-3.5", here ? "bg-primary active:bg-primary/85" : "bg-muted active:bg-muted/70")}>
          <Ring share={done ? 1 : count.total ? count.learned / count.total : 0}
            color={here && !tablet ? colors.variables["--primary-foreground"] ?? colors.background : ringColor} />
          <Text numberOfLines={1} className={cn("text-sm font-bold", here && !tablet && "text-primary-foreground", tablet && "text-[15px]", tablet && !here && "text-muted-foreground")}>{tr(st.title)}</Text>
          {tablet && here && <View className="absolute right-0 bottom-0 left-0 h-[3px] rounded-full bg-primary" />}
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}

/** The step's sheet: its title, what it changes on the cube (before and after), its explanation and numbered tips. */
function StepSheet({ puzzle, method, entry, bare = false }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry; bare?: boolean }) {
  const step = method.steps[entry.step]!, picture = stepPicture(method, entry.step);
  const cases = useAtomValue(casesAtom), learnedIds = useAtomValue(learnedCaseIdsAtom);
  const openNotation = useSetAtom(notationAtom);
  const count = stepLearned(step, cases, new Set(learnedIds), entry);
  const cube = !!puzzleInfo(puzzle).cubeSize;
  return <View className="gap-3">
    {!bare && <View className="flex-row items-center gap-3">
      <Text numberOfLines={2} className="min-w-0 flex-1 text-[28px] leading-8 font-extrabold tracking-[-0.04em]">{tr(step.title)}</Text>
      {cube && <View className="items-center rounded-2xl bg-muted p-1.5" accessibilityLabel={tr("Before and after this step")}>
        <StepCube puzzle={puzzle} setup={picture.before} mask={picture.mask} size={46} />
        <Icon as={ChevronRight} size={12} className="rotate-90 text-muted-foreground" />
        <StepCube puzzle={puzzle} setup={picture.after} mask={picture.mask} size={46} />
      </View>}
    </View>}
    {bare && cube && <View className="flex-row items-center justify-center gap-2 rounded-2xl bg-muted p-3" accessibilityLabel={tr("Before and after this step")}>
      <StepCube puzzle={puzzle} setup={picture.before} mask={picture.mask} size={64} />
      <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
      <StepCube puzzle={puzzle} setup={picture.after} mask={picture.mask} size={64} />
    </View>}
    <Text className="text-[15px] leading-[22px] text-foreground/85">{tr(step.text)}</Text>
    {/* Its tips in the sheet only: a phone's intuitive step keeps its workbench in view. */}
    {bare && step.tips?.map((tip, i) => <View key={tip} className="flex-row gap-3">
      <View className="size-6 items-center justify-center rounded-lg bg-muted"><Numeric className="text-xs font-bold text-warning">{i + 1}</Numeric></View>
      <Text className="min-w-0 flex-1 text-[13px] leading-[19px] text-muted-foreground">{tr(tip)}</Text>
    </View>)}
    {step.missing && count.total > 0 ? <Alert>{tr(step.missing)}</Alert> : null}
    {bare && <Button variant="outline" className="h-11 gap-2 self-start rounded-xl" onPress={() => openNotation(true)}>
      <Icon as={BookA} size={16} className="text-muted-foreground" /><Text>{tr("Notation")}</Text>
    </Button>}
  </View>;
}

/**
 * A step's lesson in a sheet over another page (the assisted solve, which must not be left): its sheet, then its
 * algorithms, each with what it is for, a tap playing it in 3D.
 */
export function StepLesson({ puzzle, methodId, step: index, onClose }: { puzzle: PuzzleId; methodId: string; step: number | null; onClose: () => void }) {
  const method = methodOf(puzzle, methodId)!, progress = useAtomValue(courseProgressAtom);
  // The last step stays shown while the sheet goes away.
  const [shown, setShown] = useState(index ?? 0);
  if (index !== null && index !== shown) setShown(index);
  const [playing, setPlaying] = useState<number | null>(null);
  const step = method.steps[shown]!, algs = step.algs ?? [], mask = step.mask ?? "full";
  const items = algs.map((a): PlayItem => ({ key: algId(step, a), name: a.name, detail: a.detail, context: step.title, algs: [a.alg, ...(a.alternatives ?? [])], note: a.note, size: puzzleInfo(puzzle).cubeSize ?? 3, mask, setup: a.setup }));
  return <>
    <Sheet open={index !== null} onClose={onClose} title={tr(step.title)} scroll>
      <StepSheet puzzle={puzzle} method={method} entry={{ ...courseEntry(progress, puzzle, method.id), step: shown }} bare />
      {algs.map((a, i) => <Pressable key={a.name} accessibilityRole="button" accessibilityLabel={tr("Play {0} in 3D", { 0: tr(a.name) })} onPress={() => setPlaying(i)}
        className="flex-row items-center gap-3 rounded-2xl bg-card p-3 active:bg-muted">
        <InlineDiagram puzzle={puzzle} step={step} alg={a} size={56} />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-base font-extrabold">{tr(a.name)}</Text>
          {a.note ? <Text className="text-[13px] leading-[18px] text-muted-foreground">{tr(a.note)}</Text> : null}
          <Alg text={a.alg} size={15} />
        </View>
        <Icon as={Play} size={18} className="text-primary" />
      </Pressable>)}
    </Sheet>
    <AlgPlayerSheet items={items} index={playing} onIndex={setPlaying} onClose={() => setPlaying(null)} />
  </>;
}

/** A wide button of a docked panel: its icon and its label. */
function SideAction({ icon, label, onPress, disabled }: { icon: LucideIcon; label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    className={cn("h-11 flex-row items-center justify-center gap-2 rounded-xl bg-muted px-3 active:bg-muted/70", disabled && "opacity-40")}>
    <Icon as={icon} size={17} />
    <Text numberOfLines={1} className="shrink text-[15px] font-bold">{label}</Text>
  </Pressable>;
}

/**
 * An intuitive step on a tablet: its sheet read large at the top (the cube before and after, its title, its text and
 * its tips as cards), its workbench and Previous / Next step peeking above the bar, or docked beside it when wide.
 */
function IntuitiveStep({ puzzle, method, entry, wide, nav }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry; wide: boolean; nav: ReactNode }) {
  const poster = <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-4 px-7 pt-4 pb-4"><StepPoster puzzle={puzzle} method={method} entry={entry} /></ScrollView>;
  return wide
    ? <View className="min-h-0 flex-1 flex-row">{poster}<View className={DOCKED}><IntuitiveBench puzzle={puzzle} method={method} entry={entry} bare /><View className="flex-1" />{nav}</View></View>
    : <>{poster}<View className={PEEK}><IntuitiveBench puzzle={puzzle} method={method} entry={entry} row bare />{nav}</View></>;
}

/** A step's sheet at a tablet's size: the cube before and after it large, its title, its text, its tips side by side. */
function StepPoster({ puzzle, method, entry }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry }) {
  const step = method.steps[entry.step]!, picture = stepPicture(method, entry.step);
  const cases = useAtomValue(casesAtom), learnedIds = useAtomValue(learnedCaseIdsAtom);
  const { width, wide } = useLayout();
  const count = stepLearned(step, cases, new Set(learnedIds), entry);
  // Two cubes across the page (less the docked panel when wide), at most 250 each.
  const size = Math.max(120, Math.min(250, Math.round(((wide ? width - 392 : width) - 56 - 100) / 2)));
  return <>
    {puzzleInfo(puzzle).cubeSize ? <View className="flex-row items-center justify-center gap-5 rounded-3xl bg-card p-5" accessibilityLabel={tr("Before and after this step")}>
      <StepCube puzzle={puzzle} setup={picture.before} mask={picture.mask} size={size} />
      <Icon as={ChevronRight} size={22} className="text-muted-foreground" />
      <StepCube puzzle={puzzle} setup={picture.after} mask={picture.mask} size={size} />
    </View> : null}
    <View className="gap-1.5">
      <Text className="text-[40px] leading-[44px] font-extrabold tracking-[-0.04em]">{tr(step.title)}</Text>
      <Text className="text-base leading-6 text-foreground/85">{tr(step.text)}</Text>
    </View>
    {step.tips?.length ? <View className="flex-row flex-wrap gap-3">
      {step.tips.map((tip, i) => <View key={tip} className="min-w-[30%] flex-1 gap-1.5 rounded-2xl bg-card p-4">
        <Numeric className="text-2xl font-extrabold text-warning">{i + 1}</Numeric>
        <Text className="text-sm leading-5 text-foreground/85">{tr(tip)}</Text>
      </View>)}
    </View> : null}
    {step.missing && count.total > 0 ? <Alert>{tr(step.missing)}</Alert> : null}
  </>;
}

/** An intuitive step's workbench: Train the cross where it has its training, and Mark as mastered; or its algorithms to come. */
function IntuitiveBench({ puzzle, method, entry, row = false, bare = false }: { puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry; row?: boolean; bare?: boolean }) {
  const [progress, setProgress] = useAtom(courseProgressAtom);
  const setTrainingMode = useSetAtom(trainingSetupModeAtom), setTrainingStep = useSetAtom(trainingStepAtom), setRun = useSetAtom(trainingRunAtom), setRoute = useSetAtom(routeAtom);
  const step = method.steps[entry.step]!, train = step.train && puzzle === "333", mastered = stepMastered(step, entry);
  const card = (icon: LucideIcon, title: string, onPress: () => void, primary: boolean, on = false, label = title) =>
    <Pressable accessibilityRole={primary ? "button" : "switch"} accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={onPress}
      className={cn("min-h-16 flex-row items-center gap-3 rounded-2xl px-3 py-2.5", row && "min-w-0 flex-1", primary ? "bg-primary active:bg-primary/85" : on ? "bg-success/15 active:bg-success/25" : "bg-muted active:bg-muted/70")}>
      <View className={cn("size-10 items-center justify-center rounded-xl", primary ? "bg-primary-foreground/15" : "bg-card")}>
        <Icon as={icon} size={20} className={primary ? "text-primary-foreground" : on ? "text-success" : "text-foreground"} />
      </View>
      <Text className={cn("min-w-0 flex-1 text-base font-extrabold", primary && "text-primary-foreground", on && "text-success")}>{title}</Text>
      {primary && <Icon as={ChevronRight} size={18} className="text-primary-foreground" />}
    </Pressable>;
  return <View className={cn("gap-2.5 rounded-3xl bg-card p-4", bare && "rounded-none bg-transparent p-0")} accessibilityLabel={tr("Workbench")}>
    {step.missing ? <Text className="text-sm text-muted-foreground">{tr(step.missing)}</Text> : <View className={cn("gap-2.5", row && "flex-row")}>
      {/* An intuitive step with its own training mode opens it (Training → Cross). */}
      {train && card(Dumbbell, tr("Train the cross"), () => { setTrainingMode(""); setRun("cross"); setTrainingStep("practice"); setRoute({ page: "training" }); }, true)}
      {/* Says its state in a word; its full sentence is for the screen reader. */}
      {card(Check, tr("Mastered"), () => setProgress(toggleAlgLearned(progress, puzzle, method.id, stepId(step))), false, mastered, mastered ? tr("Mastered") : tr("Mark as mastered"))}
    </View>}
  </View>;
}

/**
 * A step with algorithms: the set and the filter of learned ones, then the case on the workbench (its name, diagram,
 * whether it is learned, its algorithm hidden until asked for; never its times, learning is not training), then every
 * group of the step one after another, its cases wrapping in rows, to pick from, with the cases either side. A phone
 * keeps the name, Learned, diagram and algorithm on the card, its note and choice of algorithm in a sheet from its name, and the filter
 * in a sheet of its own. Wide, the step's cases dock in a panel, the set and the filter over them.
 */
function Workbench({ puzzle, method, entry, chosen, own, onSet, onAbout, side }: {
  puzzle: PuzzleId; method: SolvingMethod; entry: CourseEntry; chosen?: { id: string; label: string; count: number }; own: { id: string; label: string; count: number }[]; onSet: (id: string) => void;
  /** Opens the step's sheet; `side`: the step's actions at the foot of the docked panel (wide screens). */
  onAbout: () => void; side?: ReactNode;
}) {
  const [progress, setProgress] = useAtom(courseProgressAtom);
  const cases = useAtomValue(casesAtom);
  const [learnedIds, toggleLearned] = useAtom(learnedCaseIdsAtom);
  const learned = useMemo(() => new Set(learnedIds), [learnedIds]);
  const learnedAlgs = useAtomValue(learnedAlgsAtom);
  const [filter, setFilter] = useAtom(learningFilterAtom);
  const { width, tablet, wide } = useLayout();
  const step = method.steps[entry.step]!;
  const shownByFilter = (on: boolean) => filter === "learned" ? on : filter === "not-learned" ? !on : true;
  const groups = useMemo(() => {
    const size = puzzleInfo(puzzle).cubeSize, list = step.algs ?? [];
    const result: [string, Piece[]][] = [];
    if (list.length) result.push([tr("Algorithms"), list.map((a): Piece => {
      const id = algId(step, a), algs = [a.alg, ...(a.alternatives ?? [])];
      return {
        key: id, name: a.name, sub: a.detail, note: a.note, algs, mine: [], learned: entry.learned.includes(id), group: tr("Algorithms"), own: a,
        play: size || isPolyPuzzle(puzzle) ? { key: id, name: a.name, detail: a.detail, context: step.title, algs, note: a.note, size: size ?? 0, mask: step.mask ?? "full", setup: a.setup, puzzle: isPolyPuzzle(puzzle) ? puzzle : undefined } : undefined,
      };
    })]);
    if (chosen) {
      const byGroup = new Map(setGroups(cases, chosen.id));
      const names = orderedGroups(cases.filter(c => c.set === chosen.id), groupOrder(chosen.id));
      for (const group of names) {
        const members = byGroup.get(group) ?? [], label = names.length > 1 ? group : chosen.label;
        result.push([label, members.map((c): Piece => {
          const mine = learned.has(c.id) ? learnedAlgs[c.id] ?? [] : [], every = c.algorithms.map(a => a.alg);
          return {
            key: c.id, name: caseTitle(c) === c.id ? c.id : tr(c.name), short: c.id,
            sub: [c.name !== caseTitle(c) && tr(c.name), c.subgroup && c.subgroup !== group && tr(c.subgroup)].filter(Boolean).join(" · ") || undefined,
            algs: [...every.filter(a => mine.includes(a)), ...every.filter(a => !mine.includes(a))].slice(0, Math.max(3, mine.length)), mine,
            learned: learned.has(c.id), group: label, c,
          };
        })]);
      }
    }
    return result;
  }, [puzzle, step, entry.learned, chosen, cases, learned, learnedAlgs]);
  const all = useMemo(() => groups.flatMap(([, pieces]) => pieces).filter(p => shownByFilter(p.learned)), [groups, filter]);
  const count = stepLearned(step, cases, learned, entry);
  // The workbench: the piece on it, the algorithm shown and whether it shows.
  const [pick, setPick] = useState<string>();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(0);
  const [filtering, setFiltering] = useState(false);
  const [caseOpen, setCaseOpen] = useState<string | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const piece = all.find(p => p.key === pick) ?? all.find(p => !p.learned) ?? all[0];
  const index = piece ? all.indexOf(piece) : -1;
  const alg = piece ? piece.algs[choice] ?? piece.algs[0] ?? "" : "";
  const select = (key: string | undefined) => { setPick(key); setOpen(false); setChoice(0); };
  const go = (by: number) => select(all[(index + by + all.length) % all.length]?.key);
  const use = (p: Piece, a: string) => {
    const algs = p.mine.includes(a) ? p.mine.filter(x => x !== a) : [...p.mine, a];
    void api.setLearned(p.c!.id, algs.length > 0, algs).catch(() => { /* Reported by the sync indicator. */ });
  };
  const toggle = (p: Piece) => p.c ? toggleLearned(p.c.id) : setProgress(toggleAlgLearned(progress, puzzle, method.id, p.key));
  const playable = useMemo(() => groups.flatMap(([, pieces]) => pieces).filter(p => p.play), [groups]);
  const caseIds = useMemo(() => all.flatMap(p => p.c ? [p.c.id] : []), [all]);
  // Every group's cases wrap in rows across the page, as many to a row as fit.
  const listWidth = width - (tablet ? 56 : 32), columns = Math.max(5, Math.floor((listWidth + 6) / 70)), tileSize = Math.floor((listWidth - 6 * (columns - 1)) / columns) - 12;
  const diagramSize = Math.min(112, Math.round(width * 0.27));
  const options = [
    { id: "all" as const, label: tr("All"), count: count.total },
    { id: "learned" as const, label: tr("Learned"), count: count.learned },
    { id: "not-learned" as const, label: tr("To learn"), count: count.total - count.learned },
  ];
  const current = options.find(o => o.id === filter)!;
  const shownGroups = groups.map(([name, pieces]) => [name, pieces.filter(p => shownByFilter(p.learned))] as [string, Piece[]]).filter(([, pieces]) => pieces.length);
  const topRow = <View className={cn("flex-row items-center gap-2 px-4 pb-2", tablet && "px-7 pt-3", wide && "p-0")}>
    {own.length > 1 && chosen ? <ScrollView horizontal showsHorizontalScrollIndicator={false} className="min-w-0 flex-1" contentContainerClassName="rounded-xl bg-muted p-1">
      {own.map(s => {
        const on = s.id === chosen.id, known = cases.filter(c => c.set === s.id && learned.has(c.id)).length;
        return <Pressable key={s.id} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={tr(s.label)} onPress={() => onSet(s.id)}
          className={cn("h-9 flex-row items-center gap-1.5 rounded-lg px-3", on && "bg-background")}>
          <Text numberOfLines={1} className={cn("text-sm font-bold", !on && "text-muted-foreground")}>{tr(s.label)}</Text>
          {on && <Numeric className="text-xs text-muted-foreground">{known}/{s.count}</Numeric>}
        </Pressable>;
      })}
    </ScrollView> : wide ? <View className="flex-1" /> : <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-bold text-muted-foreground">{chosen ? tr("Cases") : tr("Algorithms")} <Numeric className="text-sm text-muted-foreground">{count.learned} / {count.total}</Numeric></Text>}
    {/* A phone filters in the sheet of every case instead. */}
    {tablet && <ChipMenu label={tr("Filter")} value={filter} onChange={setFilter} options={options.map(o => ({ id: o.id, label: `${o.label} · ${o.count}` }))}>
      <Text className="text-sm font-bold">{current.label} <Numeric className="text-sm font-bold text-primary">{current.count}</Numeric></Text>
    </ChipMenu>}
  </View>;
  const empty = <Empty icon={Check}>
    {filter === "learned" ? tr("Nothing learned yet") : tr("All learned")}
    {!tablet && <Chip icon={ListFilter} onPress={() => setFiltering(true)}>{tr("Filter")}</Chip>}
  </Empty>;
  // A phone's card keeps what is practised with; the case's note and algorithms to pick open in a sheet from its name (no times: learning is not training).
  let details: ReactNode = null;
  const card = piece && (() => {
    // Says its state in a word, in green once learned; its full sentence is for the screen reader.
    const learnToggle = (className?: string) => <Chip icon={Check} on={piece.learned} success onPress={() => toggle(piece)} className={className}
      accessibilityLabel={piece.learned ? tr("{0} learned", { 0: said(piece.name) }) : tr("Mark {0} learned", { 0: said(piece.name) })}>{tr("Learned")}</Chip>;
    const diagram = (size: number) => <Pressable accessibilityRole="button" accessibilityLabel={piece.c ? tr("Open {0}", { 0: piece.c.id }) : tr("Play {0} in 3D", { 0: tr(piece.name) })}
      disabled={!piece.c && !piece.play} onPress={() => piece.c ? setCaseOpen(piece.c.id) : setPlaying(playable.indexOf(piece))} className="rounded-2xl active:opacity-70">
      <PieceDiagram piece={piece} puzzle={puzzle} step={step} size={size} />
    </Pressable>;
    const note = piece.note ? <Text numberOfLines={3} className="text-[13px] leading-[18px] text-muted-foreground">{tr(piece.note)}</Text> : null;
    const choices = <>
      {piece.algs.length > 1 && <View accessibilityRole="tablist" accessibilityLabel={tr("Algorithms")} className="flex-row rounded-xl bg-muted p-1">
        {piece.algs.map((a, i) => <Pressable key={a} accessibilityRole="tab" accessibilityState={{ selected: i === choice }} onPress={() => setChoice(i)}
          className={cn("h-8 flex-row items-center gap-1 rounded-lg px-2.5", i === choice && "bg-background")}>
          {piece.mine.includes(a) && <Icon as={Check} size={13} strokeWidth={3} className="text-success" />}
          <Text className={cn("text-[13px] font-bold", i !== choice && "text-muted-foreground")}>{tr("{0} moves", { 0: moveCount(a) })}</Text>
        </Pressable>)}
      </View>}
      {piece.c && <Chip icon={Check} on={piece.mine.includes(alg)} onPress={() => use(piece, alg)}>{tr("I use it")}</Chip>}
    </>;
    const well = <View className="min-h-16 flex-row items-center gap-3 rounded-2xl bg-background p-3">
      <View className="min-w-0 flex-1">
        {open ? <Alg text={alg} size={18} selectable /> : <View className="flex-row flex-wrap gap-1" accessibilityLabel={tr("{0} moves", { 0: moveCount(alg) })}>
          {Array.from({ length: moveCount(alg) }, (_, i) => <View key={i} className="h-4 w-5 rounded-[4px] bg-foreground/10" />)}
        </View>}
      </View>
      <Chip icon={open ? EyeOff : Eye} onPress={() => setOpen(!open)} accessibilityLabel={open ? tr("Hide the algorithm") : tr("Show the algorithm")}>{open ? tr("Hide") : tr("Show")}</Chip>
    </View>;
    // A tablet: the case and its diagram large on the left, its note, algorithms and the cases either side on the right.
    if (tablet) {
      const previous = all[(index - 1 + all.length) % all.length]!, following = all[(index + 1) % all.length]!;
      return <View className="flex-row gap-5 rounded-3xl bg-card p-5" accessibilityLabel={tr("Workbench")}>
        <View className="w-[270px] gap-1">
          <Text numberOfLines={1} className="text-[40px] leading-[44px] font-extrabold tracking-[-0.04em]">{said(piece.name)}</Text>
          {piece.sub ? <Text numberOfLines={1} className="text-[15px] font-semibold text-muted-foreground">{piece.sub}</Text> : null}
          <View className="flex-1 items-center justify-center pt-2">{diagram(wide ? 200 : 180)}</View>
        </View>
        <View className="min-w-0 flex-1 gap-3">
          {note}
          <View className="flex-row flex-wrap items-center gap-1.5">{learnToggle()}<View className="flex-1" />{choices}</View>
          {well}
          <View className="flex-1" />
          <View className="min-h-11 flex-row items-center justify-end gap-2">
            {all.length > 1 && <>
              <Pressable accessibilityRole="button" accessibilityLabel={tr("Previous case")} onPress={() => go(-1)} className="h-11 flex-row items-center gap-1 rounded-xl pr-3.5 pl-2 active:bg-muted/70">
                <Icon as={ChevronLeft} size={18} /><Text numberOfLines={1} className="text-[15px] font-bold">{said(previous.short ?? previous.name)}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={tr("Next case")} onPress={() => go(1)} className="h-11 flex-row items-center gap-1 rounded-xl bg-muted pr-2 pl-3.5 active:bg-muted/70">
                <Text numberOfLines={1} className="text-[15px] font-bold">{said(following.short ?? following.name)}</Text><Icon as={ChevronRight} size={18} />
              </Pressable>
            </>}
          </View>
        </View>
      </View>;
    }
    details = <Sheet open={detailsOpen} onClose={() => setDetailsOpen(false)} title={piece.name} description={piece.sub} scroll>
      {piece.note ? <Text className="text-[15px] leading-[22px] text-foreground/85">{tr(piece.note)}</Text> : null}
      {(piece.algs.length > 1 || piece.c) && <View className="flex-row flex-wrap items-center gap-1.5">{choices}</View>}
    </Sheet>;
    return <View className="gap-3 rounded-3xl bg-card p-4" accessibilityLabel={tr("Workbench")}>
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1 gap-1.5">
          <Pressable accessibilityRole="button" accessibilityLabel={tr("Show the details")} onPress={() => setDetailsOpen(true)} className="gap-0.5 rounded-lg active:opacity-70">
            <View className="flex-row items-center gap-1.5">
              <Text numberOfLines={2} className="shrink text-[30px] leading-[34px] font-extrabold tracking-[-0.04em]">{said(piece.name)}</Text>
              <Icon as={Info} size={16} className="text-muted-foreground" />
            </View>
            {piece.sub ? <Text numberOfLines={1} className="text-sm text-muted-foreground">{piece.sub}</Text> : null}
          </Pressable>
          {learnToggle("self-start")}
        </View>
        {diagram(diagramSize)}
      </View>
      {well}
    </View>;
  })();
  const sheets = <>
    <Sheet open={filtering} onClose={() => setFiltering(false)} title={tr("Filter")}>
      <Segmented label={tr("Filter")} value={filter} onChange={id => { setFilter(id); setFiltering(false); }} options={options.map(o => ({ ...o, accent: o.id === filter }))} />
    </Sheet>
    <AlgPlayerSheet items={playable.map(p => p.play!)} index={playing} onIndex={setPlaying} onClose={() => setPlaying(null)} />
    <CaseSheet caseId={caseOpen} ids={caseIds} onChange={setCaseOpen} onClose={() => setCaseOpen(null)} />
    {details}
  </>;
  // Wide: the workbench and the step's sheet on the page, every case of the step docked beside, with the step's actions under them.
  if (wide) return <>
    <View className="min-h-0 flex-1 flex-row">
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-3 px-7 pt-4 pb-3">
        {card ?? empty}
        <Pressable accessibilityRole="button" accessibilityLabel={tr("About this step")} onPress={onAbout} className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3 active:bg-muted/60">
          <IconTile icon={Info} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text numberOfLines={1} className="text-xs font-bold text-primary">{tr("About this step")}</Text>
            <Text numberOfLines={1} className="text-sm text-muted-foreground">{tr(step.text)}</Text>
          </View>
          <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
        </Pressable>
      </ScrollView>
      <View className={DOCKED}>
        <View className="flex-row items-baseline justify-between gap-2">
          <Text className="text-xl font-extrabold tracking-tight">{chosen ? tr("Cases") : tr("Algorithms")}</Text>
          <Numeric className="text-sm text-muted-foreground">{count.learned} / {count.total}</Numeric>
        </View>
        {topRow}
        <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-1.5 pb-1" accessibilityLabel={tr("Every case of the step")}>
          {shownGroups.map(([name, pieces]) => {
            const known = pieces.filter(p => p.learned).length;
            return <View key={name} className="gap-1.5">
              <View className="flex-row justify-between pt-1.5">
                <Text numberOfLines={1} className="shrink text-[13px] font-extrabold text-muted-foreground">{tr(name)}</Text>
                <Numeric className={cn("text-[13px]", known === pieces.length ? "text-success" : "text-muted-foreground")}>{known} / {pieces.length}</Numeric>
              </View>
              <View className="flex-row flex-wrap gap-1.5">
                {pieces.map(p => <PieceTile key={p.key} p={p} here={p === piece} puzzle={puzzle} step={step} size={50} onPress={() => select(p.key)} />)}
              </View>
            </View>;
          })}
        </ScrollView>
        {side}
      </View>
    </View>
    {sheets}
  </>;
  // A phone shows the top row only to switch sets; under the case, every group of the step, one after another.
  return <>
    {(tablet || own.length > 1) && topRow}
    <ScrollView className="min-h-0 flex-1" contentContainerClassName={cn("gap-2.5 px-4 pb-2", tablet && "gap-3 px-7")}>
      {card ?? empty}
      {piece && <View className="gap-1" accessibilityLabel={tr("Every case of the step")}>
        <View className="flex-row items-center gap-1">
          <Text numberOfLines={1} className="text-sm font-bold">{chosen ? tr("Cases") : tr("Algorithms")}</Text>
          <Numeric className="text-sm text-muted-foreground">{count.learned} / {count.total}</Numeric>
          {filter !== "all" && <Text numberOfLines={1} className="shrink text-sm font-bold text-primary">{current.label}</Text>}
          <View className="flex-1" />
          <HeadButton icon={ListFilter} label={tr("Filter")} active={filter !== "all"} onPress={() => setFiltering(true)} />
          {all.length > 1 && <>
            <HeadButton icon={ChevronLeft} label={tr("Previous case")} onPress={() => go(-1)} />
            <HeadButton icon={ChevronRight} label={tr("Next case")} onPress={() => go(1)} />
          </>}
        </View>
        {shownGroups.map(([name, pieces]) => {
          const known = pieces.filter(p => p.learned).length;
          return <View key={name} className="gap-1.5 pb-1">
            {shownGroups.length > 1 && <View className="flex-row justify-between">
              <Text numberOfLines={1} className="shrink text-[13px] font-extrabold text-muted-foreground">{tr(name)}</Text>
              <Numeric className={cn("text-[13px]", known === pieces.length ? "text-success" : "text-muted-foreground")}>{known} / {pieces.length}</Numeric>
            </View>}
            <View className="flex-row flex-wrap gap-1.5">
              {pieces.map(p => <PieceTile key={p.key} p={p} here={p === piece} puzzle={puzzle} step={step} size={tileSize} onPress={() => select(p.key)} />)}
            </View>
          </View>;
        })}
      </View>}
    </ScrollView>
    {sheets}
  </>;
}

/** A piece to pick: its diagram, faded while to learn; the one on the workbench outlined. */
function PieceTile({ p, here, puzzle, step, size, onPress }: { p: Piece; here: boolean; puzzle: PuzzleId; step: MethodStep; size: number; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: here }} accessibilityLabel={`${said(p.name)} · ${p.learned ? tr("Learned") : tr("To learn")}`}
    className={cn("items-center rounded-2xl border-2 p-1", here ? "border-primary bg-card" : p.learned ? "border-transparent bg-card" : "border-transparent")}>
    <View style={{ opacity: p.learned || here ? 1 : 0.45 }}><PieceDiagram piece={p} puzzle={puzzle} step={step} size={size} /></View>
  </Pressable>;
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
    <Text accessibilityRole="header" className="text-[30px] leading-9 font-extrabold tracking-[-0.04em]">{tr("{0} done", { 0: tr(method.name) })}</Text>
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
