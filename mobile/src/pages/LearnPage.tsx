import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { BookA, Check, ChevronRight, CircleHelp, Play } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import {
  LEVEL_LABEL, algId, algSetup, courseEntry, goToStep, methodFacts, methodLearned, methodOf, methodProgress, methodsFor, methodShare, openCourse,
  recommendedMethod, stepDone, stepLearned, stepPicture, type CourseEntry, type CourseProgress,
} from "../../../src/client/lib/course";
import { plural } from "../../../src/client/lib/format";
import { applyAlg, solved } from "../../../src/shared/cube";
import { viewForMask } from "../../../src/shared/cubeDiagram";
import type { MethodAlgorithm, MethodLevel, MethodStep, SolvingMethod } from "../../../src/shared/methods";
import { puzzleInfo, type PuzzleId, type SolveMode } from "../../../src/shared/puzzles";
import type { CaseDto } from "../../../src/shared/types";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Alg, Bar, HeadButton, Numeric } from "../components/layout";
import { AppBar, SectionTabs } from "../components/AppBar";
import { PuzzleIcon } from "../components/PuzzlePicker";
import { Sheet } from "../components/Sheet";
import { StaticCubeSvg } from "../components/StaticCubeSvg";
import { AlgPlayerSheet, type PlayItem } from "../components/AlgPlayer";
import { CoursePage } from "./CoursePage";
import { useLayout } from "../hooks/useLayout";
import { useTourTarget } from "../tour";
import { useColors } from "../theme";
import {
  casesAtom, courseProgressAtom, guidesAtom, learnMethodAtom, learnedCaseIdsAtom, notationAtom, puzzleAtom,
  routeAtom, solveModeAtom, } from "../state";
import { tr } from "../../../src/client/i18n";

/**
 * Learn, direction A: the Courses tab shows the course to carry on, large, then every method of the puzzle as a row
 * with its share known; a method opens its course as a pushed screen, its current step on a button (the others in a drawer),
 * the step's workbench (one case at a time) and Previous / Next step at the bottom. The route is passed in rather than
 * read, so a page sliding out keeps showing what it showed.
 */
export function LearnPage({ method: methodId }: { method?: string }) {
  const puzzle = useAtomValue(puzzleAtom);
  const method = methodOf(puzzle, methodId);
  const setLearnMethod = useSetAtom(learnMethodAtom);
  useEffect(() => { setLearnMethod(method?.id); }, [method?.id, setLearnMethod]);
  return method ? <CoursePage key={`${puzzle}:${method.id}`} puzzle={puzzle} method={method} /> : <Methods puzzle={puzzle} />;
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
function methodRows(puzzle: PuzzleId, mode: SolveMode, cases: CaseDto[], learned: ReadonlySet<string>, progress: CourseProgress) {
  const recommended = recommendedMethod(puzzle, mode);
  return methodsFor(puzzle, mode).map(method => {
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
  const mode = useAtomValue(solveModeAtom);
  const rows = useMemo(() => methodRows(puzzle, mode, cases, learned, progress), [puzzle, mode, cases, learned, progress]);
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
    return method.steps.map(st => {
      const count = stepLearned(st, cases, learned, entry);
      return { ...count, done: stepDone(st, cases, learned, entry, count) };
    });
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
    <Pressable accessibilityRole="button" accessibilityLabel={`${state.started ? tr("Continue") : tr("Start")} ${tr(method.name)}`} accessibilityHint={tr(step.title)} onPress={onOpen}
      className="h-12 flex-row items-center justify-between rounded-2xl bg-primary px-4 active:bg-primary/85">
      <Text numberOfLines={1} className="shrink text-base font-bold text-primary-foreground">{state.started ? tr("Continue") : tr("Start")}</Text>
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


/** The case an inline algorithm solves, drawn like the catalogue's diagrams; puzzles without one keep their glyph. */
function InlineDiagram({ puzzle, step, alg, size }: { puzzle: PuzzleId; step: MethodStep; alg: MethodAlgorithm; size: number }) {
  const cube = puzzleInfo(puzzle).cubeSize, mask = step.mask ?? "full";
  const state = useMemo(() => cube ? applyAlg(solved(cube), algSetup(alg)) : null, [cube, alg]);
  if (!state) return <View className="items-center justify-center opacity-60" style={{ width: size, height: size }}><PuzzleIcon puzzle={puzzle} size={size * 0.5} /></View>;
  return <StaticCubeSvg state={state} size={size} mask={mask} view={viewForMask(mask)} />;
}

/** The cube before or after a step, showing the pieces of its mask; other puzzles their glyph. */
/** A step's picture (`stepPicture`), the cube before it or after it. */
function StepCube({ puzzle, picture, side, size }: { puzzle: PuzzleId; picture: ReturnType<typeof stepPicture>; side: "before" | "after"; size: number }) {
  const cube = puzzleInfo(puzzle).cubeSize, { mask, held } = picture, setup = picture[side];
  const state = useMemo(() => cube ? applyAlg(solved(cube), setup) : null, [cube, setup]);
  if (!state) return <View className="items-center justify-center" style={{ width: size, height: size }}><PuzzleIcon puzzle={puzzle} size={size * 0.6} /></View>;
  return <StaticCubeSvg state={state} size={size} mask={mask} view={viewForMask(mask)} held={held} />;
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
        <StepCube puzzle={puzzle} picture={picture} side="before" size={46} />
        <Icon as={ChevronRight} size={12} className="rotate-90 text-muted-foreground" />
        <StepCube puzzle={puzzle} picture={picture} side="after" size={46} />
      </View>}
    </View>}
    {bare && cube && <View className="flex-row items-center justify-center gap-2 rounded-2xl bg-muted p-3" accessibilityLabel={tr("Before and after this step")}>
      <StepCube puzzle={puzzle} picture={picture} side="before" size={64} />
      <Icon as={ChevronRight} size={16} className="text-muted-foreground" />
      <StepCube puzzle={puzzle} picture={picture} side="after" size={64} />
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








