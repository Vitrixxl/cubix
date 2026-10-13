import { Portal } from "@rn-primitives/portal";
import { useSetAtom } from "jotai";
import { Bluetooth, ChevronRight, CircleHelp, Dumbbell, GraduationCap, ListChecks, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, FlatList, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { fmtTime, solvedAt } from "../../../src/client/lib/format";
import type { CaseStats, CaseStep, MethodStats, SmartAnalysisDto, StepId, TrainingSuggestion } from "../../../src/client/lib/smartStats";
import type { PhaseId } from "../../../src/client/lib/solveAnalysis";
import type { CaseDto } from "../../../src/shared/types";
import { said, tr } from "../../../src/client/i18n";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { local } from "../api";
import { AppBar, SectionTabs } from "../components/AppBar";
import { CaseDiagram } from "../components/CaseDiagram";
import { Alg, Empty, Label, Numeric, Segmented } from "../components/layout";
import { Sheet } from "../components/Sheet";
import { useSmartAnalysis } from "../components/analysis/data";
import { Dot, SplitTime as Time, seconds, useStepColour } from "../components/analysis/steps";
import { guidesAtom, puzzleAtom, replaceRouteAtom, routeAtom, selectedCaseIdsAtom, trainingSetupModeAtom, trainingStepAtom } from "../state";
import { alpha, mix, useColors } from "../theme";
import { useLayout } from "../hooks/useLayout";

/**
 * The analysis of the solves turned on a smart cube, as the web's (desktop/renderer/profile/analysis.tsx), as a board
 * of tiles: the average solve with the latest ones, a tile per step, the case sets and the training of the moment. A
 * set opens over the whole screen, one case large and the others as a film strip.
 */

/** Each step in the colour it has in a solve's bar. */
const COLOUR: Record<StepId, PhaseId> = { cross: "cross", eoline: "eoline", fb: "fb", sb: "sb", f2l: "f2l4", cmll: "cmll", oll: "oll", pll: "pll", lse: "lse" };
/** The latest solves each step's mean is compared with. */
const RECENT = 10;
/** The case sets, each with the catalogue's cases of it. */
const BOARD: { id: CaseStep; label: string; set: (set: string) => boolean }[] = [
  { id: "f2l", label: "F2L", set: set => set === "f2l" },
  { id: "oll", label: "OLL", set: set => set === "oll" },
  { id: "pll", label: "PLL", set: set => set === "pll" },
  { id: "zbll", label: "ZBLL", set: set => set.startsWith("zbll") },
];
const SORTS = [{ id: "cost", label: "Cost" }, { id: "recognition", label: "Recognition" }, { id: "count", label: "Frequency" }];
type Sort = "cost" | "recognition" | "count";
type Latest = SmartAnalysisDto["latest"][number];
const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const cases = () => local.read.catalog("333").cases;

/** The training as the user set it up: the cases chosen, the Cross training, or a course to learn new cases first. */
function useStart() {
  const setPuzzle = useSetAtom(puzzleAtom), setSelection = useSetAtom(selectedCaseIdsAtom), setRoute = useSetAtom(routeAtom);
  const setStep = useSetAtom(trainingStepAtom), setMode = useSetAtom(trainingSetupModeAtom);
  return {
    train: (ids: string[]) => { setPuzzle("333"); setSelection(ids); setRoute({ page: "training", autostart: true }); },
    open: (id: string) => { setPuzzle("333"); setRoute({ page: "algorithms", caseId: id }); },
    cross: () => { setPuzzle("333"); setStep("setup"); setMode("cross"); setRoute({ page: "training" }); },
    learn: (method: string) => { setPuzzle("333"); setRoute({ page: "learn", method }); },
  };
}
/** Only learned cases are trained: the others are learned first. */
const learnedOnly = (ids: string[]) => { const learned = new Set(local.learned()); return ids.filter(id => learned.has(id)); };

export function AnalysisPage() {
  const { analysis: a, pending } = useSmartAnalysis("standard"),
    [methodId, setMethod] = useState("all"),
    method = a?.methods.find(m => m.id === methodId) ?? a?.methods[0];
  const openGuide = useSetAtom(guidesAtom), setRoute = useSetAtom(replaceRouteAtom);
  return <View className="flex-1">
    <AppBar puzzle={false} />
    <SectionTabs />
    {!a || (!method && pending) ? <Empty icon={Bluetooth} title={tr("Analysing your smart cube solves…")} />
      : !method ? <Empty icon={Bluetooth} title={tr("Only available for solves done on a connected cube")}>
        <View className="flex-row gap-2">
          <Button variant="secondary" onPress={() => openGuide("smartCube")}><Icon as={CircleHelp} size={16} /><Text>{tr("Smart cubes")}</Text></Button>
          <Button variant="secondary" onPress={() => setRoute({ page: "playground" })}><Text>{tr("Open the timer")}</Text></Button>
        </View>
      </Empty>
      : <Board key={method.id} a={a} method={method} pending={pending} onMethod={setMethod} />}
  </View>;
}

/** The tiles, the chosen set over them. */
function Board({ a, method, pending, onMethod }: { a: SmartAnalysisDto; method: MethodStats; pending: number; onMethod: (id: string) => void }) {
  const [set, setSet] = useState<CaseStep | null>(null), [all, setAll] = useState(false);
  const setRoute = useSetAtom(routeAtom), colour = useStepColour(), { tablet, wide } = useLayout();
  const steps = method.steps.filter(s => s.count),
    recent = a.latest.filter(l => method.id === "all" || l.method === method.id),
    compare = method.count > RECENT * 2 && recent.length >= RECENT,
    sets = BOARD.filter(b => b.id !== "zbll" || method.cases.some(c => c.step === "zbll")).filter(b => method.steps.some(s => s.id === b.id) || method.cases.some(c => c.step === b.id)),
    openSolve = (id: number) => setRoute({ page: "solve", id });
  const latestLink = <Pressable onPress={() => setAll(true)} className="min-h-9 flex-row items-center justify-between active:opacity-70">
    <Text className="text-sm text-muted-foreground">{tr("Latest solves")}</Text>
    <View className="flex-row items-center gap-0.5"><Text className="text-sm font-bold text-primary">{tr("All {0}", { 0: recent.length })}</Text><Icon as={ChevronRight} size={15} className="text-primary" /></View>
  </Pressable>;
  // On a wide screen the case sets are docked at the right, the first one open.
  const docked = wide && sets.length ? set ?? sets[0]!.id : null;
  return <View className="min-h-0 flex-1 flex-row">
    <ScrollView className="flex-1" contentContainerClassName={cn("gap-2.5 px-4 pt-3 pb-4", tablet && "gap-3 px-7")}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5">
        {a.methods.map(m => {
          const on = m.id === method.id;
          return <Pressable key={m.id} onPress={() => onMethod(m.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}
            className={cn("h-10 flex-row items-center gap-1.5 rounded-full px-3.5", on ? "bg-primary/15" : "bg-muted")}>
            <Text className={cn("text-sm font-bold", on ? "text-primary" : "text-foreground")}>{m.id === "all" ? tr("All") : said(m.label)}</Text>
            <Numeric className={cn("text-sm font-bold", on ? "text-primary" : "text-muted-foreground")}>{m.count}</Numeric>
          </Pressable>;
        })}
      </ScrollView>
      <View className="gap-2.5 rounded-3xl bg-card p-4">
        <View className="flex-row items-center justify-between gap-2">
          <Label className="font-bold tracking-widest uppercase">{pending ? tr("analysing {0} more…", { 0: pending }) : tr("Your average solve")}</Label>
          {method.best != null && <View className="rounded-full bg-success/15 px-2.5 py-1"><Numeric className="text-xs font-bold text-success">{tr("Best")} {fmtTime(method.best)}</Numeric></View>}
        </View>
        <View className="flex-row items-end justify-between gap-3">
          <Time text={fmtTime(method.mean)} size={44} className="shrink" />
          <View className="items-end">
            <Numeric className="text-xs text-muted-foreground">{tr("{0} turns", { 0: method.turns.toFixed(1) })} · {method.tps.toFixed(2)} {tr("TPS")}</Numeric>
            {method.steps.some(s => s.id === "cross") && <Numeric className="text-xs text-muted-foreground">{tr("XCross")} {Math.round((method.xcross / Math.max(method.count, 1)) * 100)} %</Numeric>}
          </View>
        </View>
        <StepsBar parts={steps.map(s => [s.id, s.share])} height={12} />
        {/* A tablet lists the latest solves in their own card, beside the training. */}
        {!tablet && <>
          <View className="h-px bg-border" />
          {recent.slice(0, 2).map(l => <LatestRow key={l.id} solve={l} onPress={() => openSolve(l.id)} />)}
          {latestLink}
        </>}
      </View>
      <View className="flex-row gap-1.5">
        {steps.map(step => {
          const c = colour(COLOUR[step.id]), recognition = step.id === "cross" ? 0 : step.recognition,
            delta = compare ? average(recent.slice(0, RECENT).map(l => l.steps[step.id] ?? 0).filter(t => t > 0)) - step.duration : null;
          return <View key={step.id} className="min-w-0 flex-1 gap-1.5 rounded-[20px] bg-card px-2.5 py-3"
            accessibilityLabel={tr("{0}: recognition {1} s, execution {2} s", { 0: said(step.label), 1: seconds(recognition), 2: seconds(step.duration - recognition) })}>
            <View className="flex-row items-center gap-1"><Dot colour={c} /><Text numberOfLines={1} className="shrink text-xs font-bold">{said(step.label)}</Text></View>
            <Numeric className="text-xl font-extrabold tracking-tight">{seconds(step.duration)}</Numeric>
            <View className="h-2 flex-row gap-0.5">
              {recognition > 0 && <View className="rounded-l-full" style={{ flex: recognition, backgroundColor: alpha(c, 45) }} />}
              <View className={cn("rounded-r-full", !recognition && "rounded-l-full")} style={{ flex: Math.max(step.duration - recognition, 1), backgroundColor: c }} />
            </View>
            <Numeric numberOfLines={1} adjustsFontSizeToFit className="text-xs text-muted-foreground">
              {delta != null && <Text className={cn("text-xs font-bold", delta <= -50 ? "text-success" : delta >= 50 ? "text-destructive" : "text-muted-foreground")}>{delta > 0 ? "+" : "−"}{seconds(Math.abs(delta))} · </Text>}
              {Math.round(step.share * 100)} %
            </Numeric>
          </View>;
        })}
      </View>
      {!docked && <View className="flex-row gap-1.5">
        {sets.map(b => {
          const seen = method.cases.filter(c => c.step === b.id).length, total = cases().filter(c => b.set(c.set)).length;
          return <Pressable key={b.id} onPress={() => setSet(b.id)} accessibilityRole="button" accessibilityLabel={tr("{0} cases", { 0: b.label })}
            className="min-w-0 flex-1 gap-1 rounded-[20px] bg-card p-3 active:bg-muted">
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-extrabold">{b.label}</Text>
              <Ring ratio={total ? seen / total : 0} label={String(seen)} />
            </View>
            <Numeric className="text-xs text-muted-foreground">{tr("{0} / {1} seen", { 0: seen, 1: total })}</Numeric>
          </Pressable>;
        })}
      </View>}
      {tablet ? <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1"><Plan suggestions={a.suggestions} /></View>
        <View className="min-w-0 flex-1 gap-1 rounded-3xl bg-card px-4 py-3">
          {recent.slice(0, 6).map(l => <LatestRow key={l.id} solve={l} onPress={() => openSolve(l.id)} />)}
          {latestLink}
        </View>
      </View> : <Plan suggestions={a.suggestions} />}
    </ScrollView>
    {docked ? <View className="w-[400px] py-3 pr-4"><CaseSet docked method={method} step={docked} sets={sets} onStep={setSet} onClose={() => setSet(null)} /></View>
      : set && <CaseSet method={method} step={set} sets={sets} onStep={setSet} onClose={() => setSet(null)} />}
    <Sheet open={all} onClose={() => setAll(false)} title={tr("Latest smart cube solves")} scroll>
      <View className="gap-1 pb-2">
        {recent.map(l => <LatestRow key={l.id} solve={l} onPress={() => { setAll(false); openSolve(l.id); }} />)}
      </View>
    </Sheet>
  </View>;
}

/** Steps as one bar, each as long as its part. */
function StepsBar({ parts, height }: { parts: [StepId, number][]; height: number }) {
  const colour = useStepColour();
  return <View className="flex-row gap-1" style={{ height }}>
    {parts.filter(([, v]) => v > 0).map(([id, v]) => <View key={id} className="rounded-full" style={{ flexGrow: v, flexBasis: 0, minWidth: height / 2, backgroundColor: colour(COLOUR[id]) }} />)}
  </View>;
}

/** A latest solve: its time, its steps as one bar, when; a tap opens its replay. */
function LatestRow({ solve, onPress }: { solve: Latest; onPress: () => void }) {
  const { tablet } = useLayout();
  return <Pressable onPress={onPress} accessibilityRole="button" className={cn("min-h-9 flex-row items-center gap-2.5 rounded-lg active:bg-muted/60", tablet && "min-h-11")}>
    <Numeric className={cn("w-14 text-sm font-bold", solve.time === null && "text-destructive")}>{fmtTime(solve.time, { blank: tr("DNF") })}</Numeric>
    <View className="flex-1"><StepsBar parts={(Object.keys(COLOUR) as StepId[]).map(id => [id, solve.steps[id] ?? 0])} height={6} /></View>
    <Text numberOfLines={1} className="w-16 text-right text-xs text-muted-foreground">{solvedAt(solve.at)}</Text>
  </Pressable>;
}

/** How much of a set was seen, as a ring around the count. */
function Ring({ ratio, label, size = 32 }: { ratio: number; label: string; size?: number }) {
  const colors = useColors(), r = size / 2 - 3, length = 2 * Math.PI * r;
  return <View style={{ width: size, height: size }} className="items-center justify-center">
    <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.muted} strokeWidth={3.5} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.primary} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeDasharray={`${length * Math.min(1, ratio)} ${length}`} />
    </Svg>
    <Numeric className="text-[10px] font-bold">{label}</Numeric>
  </View>;
}

/** The training that would help most, one proposal at a time: swipe or tap the dots for the next. */
function Plan({ suggestions }: { suggestions: TrainingSuggestion[] }) {
  const [index, setIndex] = useState(0), [width, setWidth] = useState(0), pager = useRef<ScrollView>(null);
  const start = useStart();
  if (!suggestions.length)
    return <View className="rounded-3xl bg-card px-4 py-3.5"><Text className="text-sm text-muted-foreground">{tr("Nothing stands out yet: keep solving on the cube.")}</Text></View>;
  return <View className="gap-1.5 rounded-3xl bg-card py-3.5" onLayout={e => setWidth(e.nativeEvent.layout.width)}>
    <View className="flex-row items-center justify-between px-4">
      <Label className="font-bold tracking-widest uppercase">{tr("To work on")} · {tr("{0} of {1}", { 0: index + 1, 1: suggestions.length })}</Label>
      <View className="flex-row gap-1">
        {suggestions.map((s, i) => <Pressable key={s.id} hitSlop={6} onPress={() => { setIndex(i); pager.current?.scrollTo({ x: i * width, animated: true }); }} accessibilityLabel={said(s.title)}>
          <View className={cn("size-2 rounded-full", i === index ? "bg-primary" : "bg-muted")} />
        </Pressable>)}
      </View>
    </View>
    {width > 0 && <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
      onMomentumScrollEnd={e => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
      {suggestions.map(s => <Proposal key={s.id} suggestion={s} width={width} start={start} />)}
    </ScrollView>}
  </View>;
}

function Proposal({ suggestion: t, width, start }: { suggestion: TrainingSuggestion; width: number; start: ReturnType<typeof useStart> }) {
  // Cases to train: only the learned ones; none learned, the first is learned first.
  const ids = t.action.startsWith("trainCases:") ? t.action.slice("trainCases:".length).split(",") : null,
    learned = ids && learnedOnly(ids),
    learn = t.action.startsWith("learnFrom:") || (!!ids && !learned!.length);
  const go = () => {
    if (learned?.length) start.train(learned);
    else if (ids) start.open(ids[0]!);
    else if (t.action === "trainingStart:cross") start.cross();
    else start.learn(t.action.split(":")[2] ?? "cfop");
  };
  return <View className="flex-row items-center gap-3 px-4" style={{ width }}>
    <Text numberOfLines={2} className="min-w-0 flex-1 text-base font-extrabold tracking-tight">{said(t.title)}</Text>
    <Button onPress={go} accessibilityHint={said(t.detail)} className="h-11 gap-1.5 rounded-full px-4">
      <Icon as={learn ? GraduationCap : Dumbbell} size={17} className="text-primary-foreground" />
      <Text>{learn ? tr("Learn") : tr("Train")}</Text>
    </Button>
  </View>;
}

type Tile = { id: string; name: string; known?: CaseDto; stats?: CaseStats; heat: number };

/** The catalogue's cases of a set, with the ones of it met elsewhere (two-look), sorted; never met ones last. */
function boardOf(method: MethodStats, step: (typeof BOARD)[number], sort: Sort) {
  const seen = method.cases.filter(c => c.step === step.id),
    usual = average(seen.map(c => c.duration)),
    byId = new Map(seen.map(c => [c.id, c])),
    catalog = cases(),
    ids = [...new Set([...catalog.filter(c => step.set(c.set)).map(c => c.id), ...seen.map(c => c.id)])],
    key = (c: CaseStats) => (sort === "recognition" ? c.recognition : sort === "count" ? c.count : (c.duration - usual) * c.count);
  const tiles: Tile[] = ids.map(id => {
    const stats = byId.get(id), known = catalog.find(c => c.id === id);
    // A case 1.2 s slower than a usual one of its set takes the full red.
    return { id, name: stats?.name ?? known?.name ?? id, known, stats, heat: stats ? Math.max(0, Math.min(1, (stats.duration - usual) / 1200)) : 0 };
  });
  tiles.sort((a, b) => (a.stats && b.stats ? key(b.stats) - key(a.stats) : a.stats ? -1 : b.stats ? 1 : 0));
  return { tiles, usual };
}

/**
 * A set over the whole screen: its cases sorted, the chosen one large with its figures, the others as a film strip.
 * `docked` (a wide screen): a card column beside the board, the cases as a grid and the chosen one under it.
 */
function CaseSet({ method, step, sets, onStep, onClose, docked = false }: { method: MethodStats; step: CaseStep; sets: typeof BOARD; onStep: (step: CaseStep) => void; onClose: () => void; docked?: boolean }) {
  const insets = useSafeAreaInsets(), colors = useColors(), start = useStart();
  const [sort, setSort] = useState<Sort>("cost"), [picked, setPicked] = useState("");
  const set = BOARD.find(b => b.id === step)!,
    { tiles, usual } = useMemo(() => boardOf(method, set, sort), [method, set, sort]),
    index = Math.max(0, tiles.findIndex(t => t.id === picked)),
    tile = tiles[index],
    seen = tiles.filter(t => t.stats).length,
    slowest = learnedOnly(tiles.filter(t => t.stats).map(t => t.id)).slice(0, 5);
  useEffect(() => {
    if (docked) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { onClose(); return true; });
    return () => subscription.remove();
  }, [onClose, docked]);
  const c = tile?.stats, delta = c ? c.duration - usual : 0,
    learned = !!tile && local.learned().includes(tile.id),
    alg = tile && (local.learnedAlgs()[tile.id]?.[0] ?? tile.known?.algorithms[0]?.alg);
  const close = (then: () => void) => () => { onClose(); then(); };
  const segments = <>
    {sets.length > 1 && <Segmented label={tr("Step")} value={step} onChange={id => { setPicked(""); onStep(id); }}
      options={sets.map(b => ({ id: b.id, label: `${b.label} ${method.cases.filter(x => x.step === b.id).length}/${cases().filter(x => b.set(x.set)).length}` }))} />}
    <Segmented label={tr("Sort")} value={sort} onChange={id => { setSort(id); setPicked(""); }} options={SORTS.map(s => ({ id: s.id as Sort, label: s.label }))} />
  </>;
  const figures = c && <View className="flex-row gap-1.5">
    {([[tr("Mean"), c.duration, colors.primary], [tr("Best"), c.best, colors.variables["--success"]], [tr("Recog."), c.recognition, colors.variables["--warning"]], [tr("Exec."), c.execution, colors.variables["--lilac"]]] as const).map(([label, ms, dot]) =>
      <View key={label} className="min-w-0 flex-1 items-center gap-0.5 rounded-2xl bg-card px-1 py-2">
        <Numeric className="text-base font-extrabold">{seconds(ms)}</Numeric>
        <View className="flex-row items-center gap-1"><Dot colour={dot!} size={6} /><Text numberOfLines={1} className="text-xs text-muted-foreground">{label}</Text></View>
      </View>)}
  </View>;
  const slower = c && Math.abs(delta) >= 50 && <View className={cn("self-center rounded-full px-2.5 py-1", docked && "self-start", delta > 0 ? "bg-destructive/15" : "bg-success/15")}>
    <Numeric className={cn("text-xs font-bold", delta > 0 ? "text-destructive" : "text-success")}>
      {tr(delta > 0 ? "{0} s slower than a usual {1}" : "{0} s faster than a usual {1}", { 0: seconds(Math.abs(delta)), 1: set.label })}
    </Numeric>
  </View>;
  const algorithm = alg && <View className="gap-1 rounded-2xl bg-card px-3.5 py-2.5">
    <Label className="font-bold tracking-widest uppercase">{tr("Algorithm")}{c ? ` · ${tr("{0} turns", { 0: c.turns.toFixed(1) })}` : ""}</Label>
    <Alg text={alg} size={15} />
  </View>;
  const caseTile = (t: Tile) => <Pressable onPress={() => setPicked(t.id)} accessibilityRole="button" accessibilityState={{ selected: t === tile }} accessibilityLabel={said(t.name)}
    className={cn("items-center gap-0.5 rounded-2xl px-1 py-2", docked ? "w-full" : "w-[70px]", t === tile && "border-2 border-primary", !t.stats && "border border-muted")}
    style={t.stats ? { backgroundColor: mix(colors.variables["--destructive"]!, Math.round(t.heat * 35), colors.muted) } : undefined}>
    <View className={cn(!t.stats && "opacity-35")}>{t.known ? <CaseDiagram c={t.known} size={36} /> : <View className="size-9" />}</View>
    <Text numberOfLines={1} className="text-sm font-bold">{said(t.name)}</Text>
    <Numeric className="text-[11px] text-muted-foreground">{t.stats ? seconds(t.stats.duration) : "–"}</Numeric>
  </Pressable>;
  const scale = <View className="flex-row items-center gap-1.5">
    <Text className="text-xs text-muted-foreground">{tr("usual")}</Text>
    <View className="h-2 w-12 flex-row overflow-hidden rounded-full">
      {[0, 0.25, 0.5, 0.75, 1].map(h => <View key={h} className="flex-1" style={{ backgroundColor: mix(colors.variables["--destructive"]!, Math.round(h * 35), colors.muted) }} />)}
    </View>
    <Text className="text-xs text-muted-foreground">{tr("slow")}</Text>
  </View>;

  // Docked, nothing closes it: the actions stay where they are.
  if (docked) return <View className="min-h-0 flex-1 gap-2.5 rounded-[26px] bg-popover p-4">
    <View className="flex-row items-center justify-between gap-2">
      <Text accessibilityRole="header" className="text-xl font-extrabold tracking-[-0.03em]">{tr("Cases")}</Text>
      {scale}
    </View>
    {segments}
    <FlatList key={step + sort} data={tiles} keyExtractor={t => t.id} numColumns={4} className="min-h-0 flex-1" initialNumToRender={16} windowSize={5}
      ListEmptyComponent={<Empty>{tr("No case of the catalogue recognised yet.")}</Empty>}
      renderItem={({ item: t }) => <View style={{ width: "25%", padding: 3 }}>{caseTile(t)}</View>} />
    {tile && <View className="gap-2 rounded-3xl bg-card p-3">
      <View className="flex-row items-center gap-3">
        <View className={cn(!c && "opacity-40")}>{tile.known ? <CaseDiagram c={tile.known} size={60} /> : <View className="size-[60px]" />}</View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className="text-xl font-extrabold tracking-[-0.03em]">{said(tile.name)}</Text>
          <Text numberOfLines={1} className="text-xs text-muted-foreground">{c ? tr("seen {0} times in your solves", { 0: c.count }) : tr("never seen in your solves")}</Text>
          {slower}
        </View>
      </View>
      {figures}
      {alg && <Alg text={alg} size={14} />}
    </View>}
    <View className="flex-row gap-2">
      {slowest.length > 1 && <Button variant="secondary" size="icon" className="size-12 rounded-full" accessibilityLabel={tr("Train the {0} slowest", { 0: slowest.length })} onPress={() => start.train(slowest)}>
        <Icon as={ListChecks} size={19} />
      </Button>}
      {tile && <Button variant="secondary" className="h-12 rounded-full px-4" onPress={() => start.open(tile.id)}><Text>{tr("Open the case")}</Text></Button>}
      {tile && <Button className="h-12 flex-1 gap-1.5 rounded-full" onPress={() => (learned ? start.train([tile.id]) : start.open(tile.id))}>
        <Icon as={learned ? Dumbbell : GraduationCap} size={17} className="text-primary-foreground" />
        <Text>{learned ? tr("Train this case") : tr("Learn")}</Text>
      </Button>}
    </View>
  </View>;

  return <Portal name="analysis-set">
    <View className="absolute inset-0 bg-background" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) }}>
      <View className="min-h-14 flex-row items-center gap-1 px-2">
        <Pressable accessibilityRole="button" accessibilityLabel={tr("Close")} onPress={onClose} className="size-11 items-center justify-center rounded-full active:bg-muted">
          <Icon as={X} size={22} />
        </Pressable>
        <View className="min-w-0 flex-1 items-center">
          <Text numberOfLines={1} accessibilityRole="header" className="text-lg font-extrabold tracking-[-0.03em]">{tr("{0} cases", { 0: set.label })}</Text>
          <Numeric numberOfLines={1} className="text-xs text-muted-foreground">{tr("{0} / {1} seen", { 0: seen, 1: tiles.length })}</Numeric>
        </View>
        <View className="size-11" />
      </View>
      <View className="min-h-0 flex-1 gap-2.5 px-4">
        {segments}
        {tile ? <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-2.5">
          <View className="items-center gap-1 pt-1">
            <View className={cn(!c && "opacity-40")}>{tile.known ? <CaseDiagram c={tile.known} size={112} /> : <View className="size-28" />}</View>
            <Text className="text-3xl font-extrabold tracking-[-0.04em]">{said(tile.name)}</Text>
            <Text className="text-sm text-muted-foreground">{c ? tr("seen {0} times in your solves", { 0: c.count }) : tr("never seen in your solves")}</Text>
            {slower}
          </View>
          {figures}
          {algorithm}
        </ScrollView> : <Empty>{tr("No case of the catalogue recognised yet.")}</Empty>}
        <View className="flex-row items-center justify-between">
          <Label className="font-bold tracking-widest uppercase">{tr("Cases")} · {index + 1} / {tiles.length}</Label>
          {scale}
        </View>
        <FlatList horizontal data={tiles} keyExtractor={t => t.id} showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5" className="grow-0"
          initialNumToRender={8} windowSize={5}
          renderItem={({ item: t }) => caseTile(t)} />
      </View>
      <View className="flex-row gap-2 border-t border-border px-4 pt-2.5">
        {slowest.length > 1 && <Button variant="secondary" size="icon" className="size-12 rounded-full" accessibilityLabel={tr("Train the {0} slowest", { 0: slowest.length })} onPress={close(() => start.train(slowest))}>
          <Icon as={ListChecks} size={19} />
        </Button>}
        {tile && <Button variant="secondary" className="h-12 rounded-full px-4" onPress={close(() => start.open(tile.id))}><Text>{tr("Open the case")}</Text></Button>}
        {tile && <Button className="h-12 flex-1 gap-1.5 rounded-full" onPress={close(() => (learned ? start.train([tile.id]) : start.open(tile.id)))}>
          <Icon as={learned ? Dumbbell : GraduationCap} size={17} className="text-primary-foreground" />
          <Text>{learned ? tr("Train this case") : tr("Learn")}</Text>
        </Button>}
      </View>
    </View>
  </Portal>;
}
